import { readdir } from 'node:fs/promises';
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
}

async function listExisting(dir: string): Promise<string[]> {
  try {
    return await readdir(join(GENERATED_ROOT, dir));
  } catch {
    return [];
  }
}

export async function runScriptGenerator(
  synced: SyncedTestCase,
  graph: LineageGraph,
  config: AppConfig,
): Promise<GeneratedScript> {
  const systemPrompt = await loadPrompt('04-script-generator/system.md');
  const [existingSteps, existingUtils, existingPages] = await Promise.all([
    listExisting('steps'),
    listExisting('utils'),
    listExisting('pages'),
  ]);

  const prompt = [
    `Target application base URL: ${config.targetBaseUrl}`,
    `Xray test issue: ${synced.xrayKey}`,
    `Test case: ${synced.testCase.title} (${synced.testCase.category}, priority ${synced.testCase.priority})`,
    synced.testCase.preconditions ? `Preconditions: ${synced.testCase.preconditions}` : '',
    'Steps:',
    ...synced.testCase.steps.map((s, i) => `${i + 1}. ${s.step} -> expected: ${s.expectedResult}`),
    '',
    `Existing step definition files: ${existingSteps.join(', ') || '(none yet)'}`,
    `Existing utility files: ${existingUtils.join(', ') || '(none yet)'}`,
    `Existing page object files: ${existingPages.join(', ') || '(none yet)'}`,
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

  if (output.pageObjectFile) {
    await writeFileEnsuringDir(join(GENERATED_ROOT, output.pageObjectFile.relativePath), output.pageObjectFile.content);
  }
  for (const util of output.utilFiles) {
    await writeFileEnsuringDir(join(GENERATED_ROOT, util.relativePath), util.content);
  }

  const featureLineageId = addNode(graph, {
    type: 'script-feature',
    parentIds: [synced.xrayLineageId],
    createdBy: 'script-generator',
    payloadRef: featurePath,
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
  if (output.pageObjectFile) {
    pageObjectLineageId = addNode(graph, {
      type: 'script-page-object',
      parentIds: [featureLineageId],
      createdBy: 'script-generator',
      payloadRef: join(GENERATED_ROOT, output.pageObjectFile.relativePath),
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
  };
}
