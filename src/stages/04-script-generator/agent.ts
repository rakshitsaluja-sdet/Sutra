import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig } from '../../../config/env.js';
import { buildPlaywrightMcpConfig } from '../../../config/mcp.playwright.js';
import { addNode } from '../../lineage/graph.js';
import type { LineageGraph, LineageId } from '../../lineage/types.js';
import { runAgent } from '../../sdk/client.js';
import { writeFileEnsuringDir } from '../../utils/fsSafe.js';
import { logger } from '../../utils/logger.js';
import { loadPrompt } from '../../utils/prompts.js';
import type { SyncedTestCase } from '../03-jira-xray-sync/agent.js';
import { ScriptGeneratorOutputSchema } from './schema.js';

const GENERATED_ROOT = 'generated';

export interface GeneratedScript {
  testCaseId: string;
  xrayKey: string;
  featureLineageId: LineageId;
  stepDefLineageId: LineageId;
  pageObjectLineageId?: LineageId;
  featurePath: string;
  stepDefPath: string;
  pageObjectPath?: string;
  utilPaths: string[];
}

async function listExisting(dir: string): Promise<string[]> {
  try {
    return await readdir(join(GENERATED_ROOT, dir));
  } catch {
    return [];
  }
}

/**
 * Always called on a cache MISS only — pipeline.ts skips this entirely on a
 * hit and reuses the cached paths instead. `stablePathKey` (clauseId/testCaseId)
 * is what makes re-runs of unchanged content find the same files instead of
 * scattering new ones under a fresh-every-run Xray key — the LLM previously
 * had no id to anchor to *except* the Xray key, which changes every run by
 * design, so it reasonably (if wrongly) used that for the file path too.
 */
export async function runScriptGenerator(
  synced: SyncedTestCase,
  stablePathKey: string,
  graph: LineageGraph,
  config: AppConfig,
  supersedesFeatureLineageId?: LineageId,
): Promise<GeneratedScript> {
  // Wholesale-replace this test case's own directory before regenerating — bounds the blast
  // radius to exactly this stable key, guarantees zero orphans, no cross-clause risk. Test-case
  // shape isn't guaranteed stable across regenerations, so reconciling old-vs-new slots is fragile;
  // a clean wipe-and-regenerate is simpler and safer than trying to diff file sets.
  await rm(join(GENERATED_ROOT, 'features', stablePathKey), { recursive: true, force: true });

  const systemPrompt = await loadPrompt('04-script-generator/system.md');
  const [existingSteps, existingUtils, existingPages] = await Promise.all([
    listExisting('steps'),
    listExisting('utils'),
    listExisting('pages'),
  ]);

  const prompt = [
    `Target application base URL: ${config.targetBaseUrl}`,
    `Stable path key (use this for the feature file path — see convention below; NOT the Xray key): ${stablePathKey}`,
    `Xray test issue (use this ONLY for the @tag in the feature file): ${synced.xrayKey}`,
    `Test case: ${synced.testCase.title} (${synced.testCase.category}, priority ${synced.testCase.priority})`,
    synced.testCase.preconditions ? `Preconditions: ${synced.testCase.preconditions}` : '',
    'Steps:',
    ...synced.testCase.steps.map((s, i) => `${i + 1}. ${s.step} -> expected: ${s.expectedResult}`),
    '',
    `Existing step definition files: ${existingSteps.join(', ') || '(none yet)'}`,
    `Existing utility files: ${existingUtils.join(', ') || '(none yet)'}`,
    `Existing page object files: ${existingPages.join(', ') || '(none yet)'}`,
    config.testUser
      ? `Test account available for LOGIN ONLY — never use these or any other values to register/create an account: email="${config.testUser.email}" password="${config.testUser.password}"`
      : 'No test account credentials were provided — do not write a script that requires being logged in.',
    '',
    'Navigate the real target application via the Playwright MCP tools to ground your selectors and expected text in what is actually on the page before writing the script. Then produce the feature file, step definitions, and page object as structured output.',
  ]
    .filter(Boolean)
    .join('\n');

  const output = await runAgent({
    stageName: 'script-generator',
    prompt,
    systemPrompt,
    schema: ScriptGeneratorOutputSchema,
    model: config.claudeModel,
    mcpServers: buildPlaywrightMcpConfig(config),
    allowedTools: [
      'mcp__playwright__browser_navigate',
      'mcp__playwright__browser_snapshot',
      'mcp__playwright__browser_click',
      'mcp__playwright__browser_type',
    ],
    maxTurns: 20,
  });

  const featurePath = join(GENERATED_ROOT, output.featureFile.relativePath);
  const stepDefPath = join(GENERATED_ROOT, output.stepDefinitionsFile.relativePath);
  await writeFileEnsuringDir(featurePath, output.featureFile.content);
  await writeFileEnsuringDir(stepDefPath, output.stepDefinitionsFile.content);

  let pageObjectPath: string | undefined;
  if (output.pageObjectFile) {
    pageObjectPath = join(GENERATED_ROOT, output.pageObjectFile.relativePath);
    await writeFileEnsuringDir(pageObjectPath, output.pageObjectFile.content);
  }
  const utilPaths: string[] = [];
  for (const util of output.utilFiles) {
    const utilPath = join(GENERATED_ROOT, util.relativePath);
    await writeFileEnsuringDir(utilPath, util.content);
    utilPaths.push(utilPath);
  }

  const featureLineageId = addNode(graph, {
    type: 'script-feature',
    parentIds: [synced.xrayLineageId],
    createdBy: 'script-generator',
    payloadRef: featurePath,
    supersedes: supersedesFeatureLineageId,
    metadata: { groundingNotes: output.groundingNotes, reusedExistingFiles: output.reusedExistingFiles },
  });
  const stepDefLineageId = addNode(graph, {
    type: 'script-step-def',
    parentIds: [featureLineageId],
    createdBy: 'script-generator',
    payloadRef: stepDefPath,
    metadata: {},
  });

  let pageObjectLineageId: LineageId | undefined;
  if (pageObjectPath) {
    pageObjectLineageId = addNode(graph, {
      type: 'script-page-object',
      parentIds: [featureLineageId],
      createdBy: 'script-generator',
      payloadRef: pageObjectPath,
      metadata: {},
    });
  }

  logger.info({ testCaseId: synced.testCase.id, featurePath }, '[script-generator] script generated and grounded via Playwright MCP');

  return {
    testCaseId: synced.testCase.id,
    xrayKey: synced.xrayKey,
    featureLineageId,
    stepDefLineageId,
    pageObjectLineageId,
    featurePath,
    stepDefPath,
    pageObjectPath,
    utilPaths,
  };
}
