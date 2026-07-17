import { access } from 'node:fs/promises';
import { loadConfig } from '../../config/env.js';
import { createGraph, markStale, validateGraph } from '../lineage/graph.js';
import { JsonFileLineageStore } from '../lineage/store.js';
import type { LineageGraph, LineageId } from '../lineage/types.js';
import { loadAndSplitInput, runRequirementAnalystForClause } from '../stages/01-requirement-analyst/agent.js';
import {
  clauseCacheKey,
  getCacheEntry,
  getEntriesForInput,
  saveCacheEntry,
  type CachedStory,
  type CachedTestCase,
  type ClauseCacheEntry,
} from '../stages/01-requirement-analyst/clauseCache.js';
import type { Clause } from '../stages/01-requirement-analyst/clauseSplitter.js';
import type { InputType } from '../stages/01-requirement-analyst/detectInputType.js';
import { runTestCaseDesigner } from '../stages/02-test-case-designer/agent.js';
import {
  buildXraySyncPort,
  ensureTestSetAndPlan,
  pushTestCases,
  supersedeClauseTestCases,
  type SyncedTestCase,
} from '../stages/03-jira-xray-sync/agent.js';
import { runScriptGenerator, type GeneratedScript } from '../stages/04-script-generator/agent.js';
import { getRegistryEntry, registryKeyForInput } from '../stages/03-jira-xray-sync/xrayRegistry.js';
import { runSandboxRunner } from '../stages/05-sandbox-runner/index.js';
import { runSelfHealer } from '../stages/06-self-healer/index.js';
import { runReportWriteback } from '../stages/07-report-writeback/index.js';
import { writeFileEnsuringDir } from '../utils/fsSafe.js';
import { acquirePipelineLock } from './lock.js';
import { logger } from '../utils/logger.js';

export interface PipelineOptions {
  inputPath: string;
  inputType: InputType | 'auto';
  /** Test cases whose title contains any of these (case-insensitive) are never auto-selected as primary. */
  excludeKeywords?: string[];
}

interface RunnableTestCase extends SyncedTestCase {
  clauseId: string;
  cachedScript?: {
    featurePath: string;
    stepDefPath: string;
    pageObjectPath?: string;
    utilPaths: string[];
    featureLineageId: LineageId;
    stepDefLineageId: LineageId;
    pageObjectLineageId?: LineageId;
  };
}

async function loadOrCreateGraph(inputPath: string): Promise<LineageGraph> {
  const store = new JsonFileLineageStore('generated/lineage/graph.json');
  try {
    const existing = await store.load('generated/lineage/graph.json');
    if (existing.inputSourceFile === inputPath) {
      logger.info({ runId: existing.runId }, '[pipeline] extending existing lineage graph for this input');
      return existing;
    }
    logger.info('[pipeline] existing graph is for a different input — starting a fresh graph');
  } catch {
    logger.info('[pipeline] no existing graph found — starting fresh');
  }
  return createGraph({ inputSourceFile: inputPath, inputType: 'brd', inputHash: '' });
}

function cachedTestCaseToRunnable(cached: CachedTestCase, storyLineageId: LineageId, storyId: string, clauseId: string): RunnableTestCase {
  return {
    lineageId: cached.lineageId,
    storyLineageId,
    storyId,
    testCase: cached.testCaseSnapshot,
    xrayLineageId: cached.lineageId, // reused: the xray-test-issue node id was stored as the test case's own reference point
    xrayKey: cached.xrayKey,
    xrayIssueId: cached.xrayIssueId,
    clauseId,
    cachedScript:
      cached.featurePath && cached.stepDefPath && cached.featureLineageId && cached.stepDefLineageId
        ? {
            featurePath: cached.featurePath,
            stepDefPath: cached.stepDefPath,
            pageObjectPath: cached.pageObjectPath,
            utilPaths: cached.utilPaths,
            featureLineageId: cached.featureLineageId,
            stepDefLineageId: cached.stepDefLineageId,
            pageObjectLineageId: cached.pageObjectLineageId,
          }
        : undefined,
  };
}

export async function runPipeline(options: PipelineOptions): Promise<void> {
  // Serialize runs on the shared state files — a second concurrent run on the same
  // machine is refused (or a stale lock from a crashed run is reclaimed) so two
  // pipelines can never interleave writes to the cache/registry/graph.
  const release = await acquirePipelineLock(options.inputPath);
  try {
    await runPipelineInner(options);
  } finally {
    await release();
  }
}

async function runPipelineInner(options: PipelineOptions): Promise<void> {
  const config = loadConfig();
  const graph = await loadOrCreateGraph(options.inputPath);
  const port = buildXraySyncPort(config);

  logger.info({ inputPath: options.inputPath }, '=== QA Pipeline starting ===');

  const input = await loadAndSplitInput(options.inputPath, options.inputType);
  graph.inputType = input.inputType;
  graph.inputHash = input.inputHash;

  const siblingHeadings = input.clauses.map((c) => c.headingPath);
  const previousEntries = await getEntriesForInput(options.inputPath, port.mode);
  const handledOldClauseIds = new Set<string>();

  // Resolved early (read-only) so mid-loop supersede calls can pull a changed/removed
  // clause's old test cases out of the *existing* active Test Set — ensureTestSetAndPlan
  // itself only runs after the loop, once the full picture of this run's test cases is known.
  const existingTestSetIssueId = (await getRegistryEntry(registryKeyForInput(options.inputPath, port.mode)))?.testSetIssueId;

  const allRunnableTestCases: RunnableTestCase[] = [];
  const allStories: Array<{ lineageId: LineageId; title: string }> = [];
  const newTestIssueIdsThisRun: string[] = [];
  const allActiveTestIssueIds: string[] = [];
  const allStoryLineageIds: LineageId[] = [];

  for (const clause of input.clauses) {
    const key = clauseCacheKey(options.inputPath, port.mode, clause.clauseId);
    const directEntry = await getCacheEntry(key);

    const isDirectHit = directEntry && directEntry.clauseHash === clause.hash && directEntry.status === 'active' && Boolean(graph.nodes[directEntry.sourceLineageId]);

    if (isDirectHit && directEntry) {
      handledOldClauseIds.add(clause.clauseId);
      logger.info({ clauseId: clause.clauseId }, '[pipeline] clause cache hit — reusing everything for this section');
      for (const story of directEntry.stories) {
        allStories.push({ lineageId: story.lineageId, title: story.storySnapshot.title });
        allStoryLineageIds.push(story.lineageId);
        for (const tc of story.testCases) {
          const runnable = cachedTestCaseToRunnable(tc, story.lineageId, story.storyId, clause.clauseId);
          allRunnableTestCases.push(runnable);
          if (tc.xrayIssueId) allActiveTestIssueIds.push(tc.xrayIssueId);
        }
      }
      continue;
    }

    // Rename detection: an unmatched previous entry (different clauseId, same input) whose content hash matches exactly.
    const renameSource = previousEntries.find(
      (e) => e.clauseHash === clause.hash && e.status === 'active' && e.clauseId !== clause.clauseId && !handledOldClauseIds.has(e.clauseId),
    );
    if (renameSource && Boolean(graph.nodes[renameSource.sourceLineageId])) {
      handledOldClauseIds.add(renameSource.clauseId);
      logger.info({ oldClauseId: renameSource.clauseId, newClauseId: clause.clauseId }, '[pipeline] clause renamed, content unchanged — carrying forward, no regeneration');
      const carried: ClauseCacheEntry = { ...renameSource, clauseId: clause.clauseId, headingPath: clause.headingPath, updatedAt: new Date().toISOString() };
      await saveCacheEntry(key, carried);
      for (const story of carried.stories) {
        allStories.push({ lineageId: story.lineageId, title: story.storySnapshot.title });
        allStoryLineageIds.push(story.lineageId);
        for (const tc of story.testCases) {
          const runnable = cachedTestCaseToRunnable(tc, story.lineageId, story.storyId, clause.clauseId);
          allRunnableTestCases.push(runnable);
          if (tc.xrayIssueId) allActiveTestIssueIds.push(tc.xrayIssueId);
        }
      }
      continue;
    }

    // Genuine miss: new clause, or existing clause whose content changed.
    if (directEntry) handledOldClauseIds.add(clause.clauseId);
    logger.info({ clauseId: clause.clauseId, reason: directEntry ? 'content-changed' : 'new' }, '[pipeline] clause cache miss — regenerating');

    const { sourceLineageId, stories } = await runRequirementAnalystForClause(
      clause,
      input.background,
      siblingHeadings.filter((h) => h !== clause.headingPath),
      input.inputType,
      graph,
      config,
      directEntry?.sourceLineageId,
    );

    const testCases = await runTestCaseDesigner(stories, clause.clauseId, graph, config);
    const synced = await pushTestCases(testCases, clause.clauseId, graph, config, port);

    if (directEntry) {
      const oldTestCases = directEntry.stories.flatMap((s) => s.testCases.map((tc) => ({ xrayKey: tc.xrayKey, xrayIssueId: tc.xrayIssueId })));
      await supersedeClauseTestCases(oldTestCases, existingTestSetIssueId, 'content-changed', config, port);
      markStale(graph, directEntry.sourceLineageId);
    }

    const cachedStories: CachedStory[] = stories.map(({ lineageId, story }) => {
      const storyTestCases = synced.filter((s) => s.storyLineageId === lineageId);
      allStories.push({ lineageId, title: story.title });
      allStoryLineageIds.push(lineageId);
      return {
        storyId: story.id,
        lineageId,
        storySnapshot: story,
        testCases: storyTestCases.map((s) => ({
          testCaseId: s.testCase.id,
          lineageId: s.lineageId,
          testCaseSnapshot: s.testCase,
          xrayKey: s.xrayKey,
          xrayIssueId: s.xrayIssueId,
          utilPaths: [],
        })),
      };
    });

    await saveCacheEntry(key, {
      clauseId: clause.clauseId,
      clauseHash: clause.hash,
      headingPath: clause.headingPath,
      inputSourceFile: options.inputPath,
      status: 'active',
      sourceLineageId,
      stories: cachedStories,
      updatedAt: new Date().toISOString(),
    });

    for (const s of synced) {
      allRunnableTestCases.push({ ...s, clauseId: clause.clauseId });
      if (s.xrayIssueId) {
        allActiveTestIssueIds.push(s.xrayIssueId);
        newTestIssueIdsThisRun.push(s.xrayIssueId);
      }
    }
  }

  // Deletions: any previously-active clause for this input that this run neither hit, renamed, nor replaced.
  for (const oldEntry of previousEntries) {
    if (oldEntry.status !== 'active' || handledOldClauseIds.has(oldEntry.clauseId)) continue;
    logger.info({ clauseId: oldEntry.clauseId }, '[pipeline] clause no longer present in source — marking deprecated, superseding its test cases');
    const key = clauseCacheKey(options.inputPath, port.mode, oldEntry.clauseId);
    await saveCacheEntry(key, { ...oldEntry, status: 'deprecated', updatedAt: new Date().toISOString() });
    if (graph.nodes[oldEntry.sourceLineageId]) markStale(graph, oldEntry.sourceLineageId);
    const oldTestCases = oldEntry.stories.flatMap((s) => s.testCases.map((tc) => ({ xrayKey: tc.xrayKey, xrayIssueId: tc.xrayIssueId })));
    await supersedeClauseTestCases(oldTestCases, existingTestSetIssueId, 'clause-removed', config, port);
  }

  if (allRunnableTestCases.length === 0) {
    throw new Error('No test cases available (from cache or fresh generation) — cannot continue.');
  }

  const xraySync = await ensureTestSetAndPlan(allActiveTestIssueIds, newTestIssueIdsThisRun, allStoryLineageIds, graph, config, port);

  const excludeKeywords = options.excludeKeywords ?? [];
  const eligible = excludeKeywords.length
    ? allRunnableTestCases.filter((tc) => !excludeKeywords.some((kw) => tc.testCase.title.toLowerCase().includes(kw)))
    : allRunnableTestCases;
  if (excludeKeywords.length) {
    logger.info({ excludeKeywords, excludedCount: allRunnableTestCases.length - eligible.length }, '[pipeline] excluded test cases from auto-selection');
  }
  if (eligible.length === 0) {
    throw new Error(`--exclude-keyword filtered out every test case (${excludeKeywords.join(', ')}) — nothing eligible to automate this run.`);
  }

  const primary = eligible.find((tc) => tc.testCase.category === 'positive') ?? eligible[0]!;
  logger.info(
    { testCaseId: primary.testCase.id, category: primary.testCase.category, title: primary.testCase.title },
    '[pipeline] automating this test case end to end',
  );

  const cachedScriptStillValid = primary.cachedScript ? await access(primary.cachedScript.featurePath).then(() => true).catch(() => false) : false;

  let script: GeneratedScript;

  if (primary.cachedScript && cachedScriptStillValid) {
    logger.info({ testCaseId: primary.testCase.id, featurePath: primary.cachedScript.featurePath }, '[pipeline] script cache hit — reusing existing generated script');
    script = {
      testCaseId: primary.testCase.id,
      xrayKey: primary.xrayKey,
      featureLineageId: primary.cachedScript.featureLineageId,
      stepDefLineageId: primary.cachedScript.stepDefLineageId,
      pageObjectLineageId: primary.cachedScript.pageObjectLineageId,
      featurePath: primary.cachedScript.featurePath,
      stepDefPath: primary.cachedScript.stepDefPath,
      pageObjectPath: primary.cachedScript.pageObjectPath,
      utilPaths: primary.cachedScript.utilPaths,
    };
  } else {
    if (primary.cachedScript && !cachedScriptStillValid) {
      logger.warn({ featurePath: primary.cachedScript.featurePath }, '[pipeline] cached script path is missing on disk — regenerating');
    }
    // clauseId/storyId/testCaseId — testCaseId alone repeats across stories in a
    // clause (each story's cases restart at TC-1), so the storyId segment is what
    // keeps two same-numbered cases from colliding on one feature directory.
    const stablePathKey = `${primary.clauseId}/${primary.storyId}/${primary.testCase.id}`;
    const generated = await runScriptGenerator(primary, stablePathKey, graph, config, primary.cachedScript?.featureLineageId);
    script = generated;

    // Persist the freshly generated script's paths back into this test case's cache entry.
    const key = clauseCacheKey(options.inputPath, port.mode, primary.clauseId);
    const entry = await getCacheEntry(key);
    if (entry) {
      for (const story of entry.stories) {
        const tc = story.testCases.find((t) => t.lineageId === primary.lineageId);
        if (tc) {
          tc.featurePath = generated.featurePath;
          tc.stepDefPath = generated.stepDefPath;
          tc.pageObjectPath = generated.pageObjectPath;
          tc.utilPaths = generated.utilPaths;
          tc.featureLineageId = generated.featureLineageId;
          tc.stepDefLineageId = generated.stepDefLineageId;
          tc.pageObjectLineageId = generated.pageObjectLineageId;
        }
      }
      await saveCacheEntry(key, entry);
    }
  }

  const sandbox = await runSandboxRunner(script, graph, config);

  await runSelfHealer(sandbox.run, sandbox.sandboxRunLineageId, graph);

  const report = await runReportWriteback(sandbox.run, script.featureLineageId, primary, xraySync.testPlanIssueId, graph, config);

  await writeFileEnsuringDir('generated/lineage/stories.json', JSON.stringify(allStories, null, 2));
  await writeFileEnsuringDir('generated/lineage/testcases.json', JSON.stringify(allRunnableTestCases.map((t) => t.testCase), null, 2));

  const store = new JsonFileLineageStore('generated/lineage/graph.json');
  await store.save(graph);

  const validation = validateGraph(graph);
  if (validation.orphanParentRefs.length > 0) {
    logger.error({ orphans: validation.orphanParentRefs }, '=== Lineage graph has dangling references — investigate before trusting this run ===');
  }

  logger.info(
    {
      passed: sandbox.run.passed,
      reportPath: report.reportPath,
      graphPath: 'generated/lineage/graph.json',
      storyCount: allStories.length,
      testCaseCount: allRunnableTestCases.length,
      clauseCount: input.clauses.length,
    },
    '=== QA Pipeline complete ===',
  );

  process.exitCode = sandbox.run.passed ? 0 : 1;
}
