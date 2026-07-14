import { loadConfig } from '../../config/env.js';
import { createGraph, validateGraph } from '../lineage/graph.js';
import { JsonFileLineageStore } from '../lineage/store.js';
import { runRequirementAnalyst, type RequirementAnalystResult } from '../stages/01-requirement-analyst/agent.js';
import type { InputType } from '../stages/01-requirement-analyst/detectInputType.js';
import { runTestCaseDesigner, type DesignedTestCase } from '../stages/02-test-case-designer/agent.js';
import { runJiraXraySync } from '../stages/03-jira-xray-sync/agent.js';
import { runScriptGenerator } from '../stages/04-script-generator/agent.js';
import { runSandboxRunner } from '../stages/05-sandbox-runner/index.js';
import { runSelfHealer } from '../stages/06-self-healer/index.js';
import { runReportWriteback } from '../stages/07-report-writeback/index.js';
import { writeFileEnsuringDir } from '../utils/fsSafe.js';
import { logger } from '../utils/logger.js';

export interface PipelineOptions {
  inputPath: string;
  inputType: InputType | 'auto';
}

async function persistArtifacts(analyst: RequirementAnalystResult, testCases: DesignedTestCase[]): Promise<void> {
  await writeFileEnsuringDir('generated/lineage/stories.json', JSON.stringify(analyst.stories.map((s) => s.story), null, 2));
  await writeFileEnsuringDir('generated/lineage/testcases.json', JSON.stringify(testCases.map((t) => t.testCase), null, 2));
}

export async function runPipeline(options: PipelineOptions): Promise<void> {
  const config = loadConfig();
  const graph = createGraph({ inputSourceFile: options.inputPath, inputType: 'brd', inputHash: '' });

  logger.info({ inputPath: options.inputPath }, '=== QA Pipeline starting ===');

  // Stage 1: BRD or already-written user story, auto-detected — converges to the same UserStory[] shape either way.
  const analyst = await runRequirementAnalyst(options.inputPath, options.inputType, graph, config);
  graph.inputType = analyst.inputType;
  graph.inputHash = analyst.inputHash;

  // Stage 2
  const testCases = await runTestCaseDesigner(analyst.stories, graph, config);
  if (testCases.length === 0) {
    throw new Error('Test Case Designer produced no test cases — cannot continue.');
  }

  // Stage 3: every designed test case is synced to Xray/stub and grouped under one
  // Test Set + Test Plan for this input (reused across re-runs), proving the front
  // half of the pipeline in full even though Milestone 1 only automates one case
  // end to end.
  const xraySync = await runJiraXraySync(testCases, graph, config);

  const primary = xraySync.testCases.find((tc) => tc.testCase.category === 'positive') ?? xraySync.testCases[0]!;
  logger.info(
    { testCaseId: primary.testCase.id, category: primary.testCase.category },
    '[pipeline] Milestone 1 scope: automating this test case end to end',
  );

  // Stage 4
  const script = await runScriptGenerator(primary, graph, config);

  // Stage 5
  const sandbox = await runSandboxRunner(script, graph, config);

  // Stage 6 (stub — diagnosis only, never silently masks a failure)
  await runSelfHealer(sandbox.run, sandbox.sandboxRunLineageId, graph);

  // Stage 7
  const report = await runReportWriteback(sandbox.run, script.featureLineageId, primary, xraySync.testPlanIssueId, graph, config);

  await persistArtifacts(analyst, testCases);

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
      storyCount: analyst.stories.length,
      testCaseCount: testCases.length,
    },
    '=== QA Pipeline complete ===',
  );

  process.exitCode = sandbox.run.passed ? 0 : 1;
}
