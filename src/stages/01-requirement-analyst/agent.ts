import type { AppConfig } from '../../../config/env.js';
import { addNode } from '../../lineage/graph.js';
import type { LineageGraph, LineageId } from '../../lineage/types.js';
import { runAgent } from '../../sdk/client.js';
import { sha256Hex } from '../../utils/fsSafe.js';
import { logger } from '../../utils/logger.js';
import { loadPrompt } from '../../utils/prompts.js';
import { detectInputType, type InputType } from './detectInputType.js';
import { loadInputText } from './loadInputText.js';
import { RequirementAnalystOutputSchema, type UserStory } from './schema.js';

export interface RequirementAnalystResult {
  inputType: InputType;
  inputHash: string;
  sourceLineageId: LineageId;
  stories: Array<{ lineageId: LineageId; story: UserStory }>;
}

export async function runRequirementAnalyst(
  filePath: string,
  explicitType: InputType | 'auto',
  graph: LineageGraph,
  config: AppConfig,
): Promise<RequirementAnalystResult> {
  const rawText = await loadInputText(filePath);
  const inputType = explicitType === 'auto' ? detectInputType(rawText) : explicitType;

  logger.info({ filePath, inputType }, '[requirement-analyst] input parsed and classified');

  const systemPrompt = await loadPrompt('01-requirement-analyst/system.md');
  const modeFragment = await loadPrompt(
    inputType === 'brd'
      ? '01-requirement-analyst/extract-from-brd.md'
      : '01-requirement-analyst/normalize-user-story.md',
  );
  const prompt = modeFragment.replace('{{TEXT}}', rawText);

  const output = await runAgent({
    stageName: 'requirement-analyst',
    prompt,
    systemPrompt,
    schema: RequirementAnalystOutputSchema,
    model: config.claudeModel,
    maxTurns: 4,
  });

  const sourceLineageId = addNode(graph, {
    type: 'requirement-source',
    parentIds: [],
    createdBy: 'requirement-analyst',
    payloadRef: filePath,
    metadata: { inputType, rawTextLength: rawText.length },
  });

  const stories = output.stories.map((story) => {
    const lineageId = addNode(graph, {
      type: 'user-story',
      parentIds: [sourceLineageId],
      createdBy: 'requirement-analyst',
      payloadRef: `generated/lineage/stories.json#${story.id}`,
      metadata: { title: story.title, storyType: story.type },
    });
    return { lineageId, story };
  });

  logger.info({ storyCount: stories.length }, '[requirement-analyst] stories produced');

  return { inputType, inputHash: sha256Hex(rawText), sourceLineageId, stories };
}
