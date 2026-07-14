import type { AppConfig } from '../../../config/env.js';
import { addNode } from '../../lineage/graph.js';
import type { LineageGraph, LineageId } from '../../lineage/types.js';
import { runAgent } from '../../sdk/client.js';
import { logger } from '../../utils/logger.js';
import { loadPrompt } from '../../utils/prompts.js';
import type { UserStory } from '../01-requirement-analyst/schema.js';
import { TestCaseDesignerOutputSchema, type TestCase } from './schema.js';

export interface DesignedTestCase {
  lineageId: LineageId;
  storyLineageId: LineageId;
  storyId: string;
  testCase: TestCase;
}

export async function runTestCaseDesigner(
  stories: Array<{ lineageId: LineageId; story: UserStory }>,
  graph: LineageGraph,
  config: AppConfig,
): Promise<DesignedTestCase[]> {
  const systemPrompt = await loadPrompt('02-test-case-designer/system.md');
  const results: DesignedTestCase[] = [];

  // Sequential by design: keeps LLM call volume predictable and avoids
  // reasoning about concurrent runAgent() calls for Milestone 1's scale.
  for (const { lineageId: storyLineageId, story } of stories) {
    const output = await runAgent({
      stageName: 'test-case-designer',
      prompt: buildPrompt(story),
      systemPrompt,
      schema: TestCaseDesignerOutputSchema,
      model: config.claudeModel,
      maxTurns: 4,
    });

    for (const testCase of output.testCases) {
      const lineageId = addNode(graph, {
        type: 'test-case',
        parentIds: [storyLineageId],
        createdBy: 'test-case-designer',
        payloadRef: `generated/lineage/testcases.json#${testCase.id}`,
        metadata: { category: testCase.category, priority: testCase.priority, storyId: story.id },
      });
      results.push({ lineageId, storyLineageId, storyId: story.id, testCase });
    }
  }

  logger.info({ testCaseCount: results.length }, '[test-case-designer] test cases produced');
  return results;
}

function buildPrompt(story: UserStory): string {
  return [
    `User story: ${story.title}`,
    `As a ${story.actor}, I want ${story.goal}, so that ${story.benefit}.`,
    '',
    'Acceptance criteria:',
    ...story.acceptanceCriteria.map((ac) => `- (${ac.id}) ${ac.text}`),
  ].join('\n');
}
