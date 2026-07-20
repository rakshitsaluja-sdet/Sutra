import type { AppConfig } from '../../../config/env.js';
import { sha256Hex } from '../../utils/fsSafe.js';
import { logger } from '../../utils/logger.js';
import type { RequirementAnalystInput } from './agent.js';
import { type Clause, splitClauses } from './clauseSplitter.js';
import type { InputType } from './detectInputType.js';
import { fetchAttachmentText, getEpicChildren, getIssue, type JiraIssue } from './jiraReader.js';

export type JiraSource = { epicKey: string } | { issueKey: string };

/** A synthetic, stable identity for cache/registry/graph keying (replaces the file path). */
export function jiraSourceId(source: JiraSource): string {
  return 'epicKey' in source ? `jira:${source.epicKey}` : `jira:${source.issueKey}`;
}

const SUPPORTED_ATTACHMENT = /\.(md|markdown|txt|docx)$/i;

/**
 * Each child issue of an Epic is already a discrete requirement unit, so it maps
 * to exactly one clause — keyed by its **Jira issue key**, which is a perfect
 * stable idempotency id (no heading-hash needed). The clause body is the story's
 * summary + description, content-hashed so an edited story regenerates only itself.
 */
export function clausesFromChildren(children: JiraIssue[]): Clause[] {
  return children.map((child, order) => {
    const rawText = `${child.summary}\n\n${child.descriptionText}`.trim();
    return { clauseId: child.key, headingPath: child.summary, headingLevel: 0, rawText, hash: sha256Hex(rawText), order };
  });
}

/** Turns one BRD text blob into the analyst input (splits on markdown headings, same as the local-file flow). */
export function brdTextToInput(text: string, inputType: InputType): RequirementAnalystInput {
  const { background, clauses } = splitClauses(text, inputType);
  return { inputType, inputHash: sha256Hex(text), background, clauses };
}

/** Picks the BRD text for an issue: prefer a supported attachment (clean .md/.docx), else the description, titled by the summary. */
async function pickBrdText(issue: JiraIssue, config: AppConfig): Promise<string> {
  for (const att of issue.attachments) {
    if (!SUPPORTED_ATTACHMENT.test(att.filename)) continue;
    const text = await fetchAttachmentText(att, config);
    if (text.trim()) {
      logger.info({ key: issue.key, attachment: att.filename }, '[jira-input] using attachment as the BRD');
      return text;
    }
  }
  if (issue.descriptionText.trim()) {
    logger.info({ key: issue.key }, '[jira-input] using the issue description as the BRD');
    return `# ${issue.summary}\n\n${issue.descriptionText}`;
  }
  throw new Error(`[jira-input] issue ${issue.key} has neither a readable BRD attachment nor a description to read.`);
}

async function loadFromEpic(config: AppConfig, epicKey: string): Promise<RequirementAnalystInput> {
  const epic = await getIssue(epicKey, config);
  const children = await getEpicChildren(epicKey, config);

  if (children.length > 0) {
    // Structured: each child story is a requirement unit. The epic's own text is shared background.
    const clauses = clausesFromChildren(children);
    const background = `${epic.summary}\n\n${epic.descriptionText}`.trim();
    logger.info({ epicKey, clauseCount: clauses.length }, '[jira-input] epic with child stories');
    return { inputType: 'user-story', inputHash: sha256Hex(clauses.map((c) => c.hash).join('|')), background, clauses };
  }

  // Document: the BRD lives on the epic itself (attachment or description).
  logger.info({ epicKey }, '[jira-input] epic with no children — reading its BRD content');
  return brdTextToInput(await pickBrdText(epic, config), 'brd');
}

async function loadFromSingleIssue(config: AppConfig, issueKey: string): Promise<RequirementAnalystInput> {
  const issue = await getIssue(issueKey, config);
  return brdTextToInput(await pickBrdText(issue, config), 'brd');
}

export async function loadFromJira(config: AppConfig, source: JiraSource): Promise<RequirementAnalystInput> {
  return 'epicKey' in source ? loadFromEpic(config, source.epicKey) : loadFromSingleIssue(config, source.issueKey);
}
