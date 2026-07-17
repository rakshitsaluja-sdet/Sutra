import type { AppConfig } from '../../../config/env.js';
import { addNode } from '../../lineage/graph.js';
import type { LineageGraph, LineageId } from '../../lineage/types.js';
import { runAgent } from '../../sdk/client.js';
import { sha256Hex } from '../../utils/fsSafe.js';
import { logger } from '../../utils/logger.js';
import { loadPrompt } from '../../utils/prompts.js';
import { type Clause, splitClauses } from './clauseSplitter.js';
import { detectInputType, type InputType } from './detectInputType.js';
import { loadInputText } from './loadInputText.js';
import { RequirementAnalystOutputSchema, type UserStory } from './schema.js';

export interface RequirementAnalystInput {
  inputType: InputType;
  inputHash: string;
  background: string;
  clauses: Clause[];
}

/** Reads and classifies the input, then splits it into stable, individually-cacheable clauses — no LLM call yet. */
export async function loadAndSplitInput(filePath: string, explicitType: InputType | 'auto'): Promise<RequirementAnalystInput> {
  const rawText = await loadInputText(filePath);
  const inputType = explicitType === 'auto' ? detectInputType(rawText) : explicitType;
  logger.info({ filePath, inputType }, '[requirement-analyst] input parsed and classified');

  const { background, clauses } = splitClauses(rawText, inputType);
  logger.info({ clauseCount: clauses.length }, '[requirement-analyst] split into clauses');

  return { inputType, inputHash: sha256Hex(rawText), background, clauses };
}

export interface ClauseStoriesResult {
  sourceLineageId: LineageId;
  stories: Array<{ lineageId: LineageId; story: UserStory }>;
}

/**
 * The actual LLM call, scoped to ONE clause — cache-unaware by design. The
 * caller (pipeline.ts) decides whether this needs to run at all; when it
 * does run because a clause changed, pass the clause's previous
 * requirement-source lineage id as `supersedesSourceId` so the new node
 * records what it replaced instead of appearing unrelated.
 */
export async function runRequirementAnalystForClause(
  clause: Clause,
  background: string,
  siblingHeadings: string[],
  inputType: InputType,
  graph: LineageGraph,
  config: AppConfig,
  supersedesSourceId?: LineageId,
): Promise<ClauseStoriesResult> {
  const systemPrompt = await loadPrompt('01-requirement-analyst/system.md');
  const modeFragment = await loadPrompt(
    inputType === 'brd' ? '01-requirement-analyst/extract-from-brd.md' : '01-requirement-analyst/normalize-user-story.md',
  );
  const prompt = modeFragment
    .replace('{{BACKGROUND}}', background || '(none provided)')
    .replace('{{SIBLING_HEADINGS}}', siblingHeadings.length ? siblingHeadings.map((h) => `- ${h}`).join('\n') : '(none — this is the only section)')
    .replace('{{TEXT}}', clause.rawText);

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
    payloadRef: clause.headingPath,
    clauseId: clause.clauseId,
    supersedes: supersedesSourceId,
    metadata: { inputType, clauseHash: clause.hash, headingPath: clause.headingPath },
  });

  const stories = output.stories.map((story) => {
    const lineageId = addNode(graph, {
      type: 'user-story',
      parentIds: [sourceLineageId],
      createdBy: 'requirement-analyst',
      payloadRef: `generated/lineage/stories.json#${story.id}`,
      clauseId: clause.clauseId,
      metadata: { title: story.title, storyType: story.type },
    });
    return { lineageId, story };
  });

  logger.info({ clauseId: clause.clauseId, storyCount: stories.length }, '[requirement-analyst] stories produced for clause');
  return { sourceLineageId, stories };
}
