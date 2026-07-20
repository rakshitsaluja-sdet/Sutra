import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../../../config/env.js';
import { logger } from '../../utils/logger.js';
import { loadInputText } from './loadInputText.js';

export interface JiraAttachmentRef {
  filename: string;
  contentUrl: string;
}

export interface JiraIssue {
  key: string;
  summary: string;
  descriptionText: string;
  attachments: JiraAttachmentRef[];
}

function auth(config: AppConfig): { baseUrl: string; header: string } {
  const { jiraBaseUrl, jiraEmail, jiraApiToken } = config.xray;
  if (!jiraBaseUrl || !jiraEmail || !jiraApiToken) {
    throw new Error('[jira-input] Reading from Jira needs JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN in .env.');
  }
  return { baseUrl: jiraBaseUrl.replace(/\/+$/, ''), header: `Basic ${Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')}` };
}

/** ADF (Jira Cloud rich text) node → markdown-ish text, preserving headings so a BRD in the description still splits into clauses. */
function adfToText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; text?: string; attrs?: { level?: number }; content?: unknown[] };
  if (n.type === 'text') return n.text ?? '';
  const inner = Array.isArray(n.content) ? n.content.map(adfToText).join('') : '';
  switch (n.type) {
    case 'heading':
      return `${'#'.repeat(n.attrs?.level ?? 1)} ${inner}\n\n`;
    case 'paragraph':
      return `${inner}\n\n`;
    case 'listItem':
      return `- ${inner}\n`;
    default:
      return inner;
  }
}

/** Jira wiki-markup headings (`h2. Title`) → markdown (`## Title`), so heading-based clause splitting works whichever format the description is in. */
function wikiHeadingsToMarkdown(text: string): string {
  return text.replace(/^h([1-6])\.\s+/gm, (_m, lvl: string) => `${'#'.repeat(Number(lvl))} `);
}

export function extractDescription(description: unknown): string {
  if (!description) return '';
  if (typeof description === 'string') return wikiHeadingsToMarkdown(description).trim();
  return adfToText(description).trim();
}

interface RawIssue {
  key: string;
  fields: { summary: string; description: unknown; attachment?: Array<{ filename: string; content: string }> };
}

function toJiraIssue(raw: RawIssue): JiraIssue {
  return {
    key: raw.key,
    summary: raw.fields.summary,
    descriptionText: extractDescription(raw.fields.description),
    attachments: (raw.fields.attachment ?? []).map((a) => ({ filename: a.filename, contentUrl: a.content })),
  };
}

// Jira Cloud REST v2 returns description as a plain (wiki) string, which is simpler to
// split than v3's ADF; adfToText above covers instances that still hand back ADF.
// Verify the /search endpoint against your instance — newer Jira Cloud is migrating
// /rest/api/2/search to /rest/api/3/search/jql.
export async function getIssue(key: string, config: AppConfig): Promise<JiraIssue> {
  const { baseUrl, header } = auth(config);
  const res = await fetch(`${baseUrl}/rest/api/2/issue/${key}?fields=summary,description,attachment`, {
    headers: { Authorization: header, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`[jira-input] failed to read issue ${key}: ${res.status} ${await res.text()}`);
  return toJiraIssue((await res.json()) as RawIssue);
}

/** Child issues of an Epic. Tries `parent` (team-managed) first, then the classic "Epic Link" (company-managed). */
export async function getEpicChildren(epicKey: string, config: AppConfig): Promise<JiraIssue[]> {
  const { baseUrl, header } = auth(config);
  const search = async (jql: string): Promise<JiraIssue[]> => {
    const res = await fetch(`${baseUrl}/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=summary,description,attachment&maxResults=100`, {
      headers: { Authorization: header, Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { issues?: RawIssue[] };
    return (json.issues ?? []).map(toJiraIssue);
  };

  let children = await search(`parent = "${epicKey}" ORDER BY created ASC`);
  if (children.length === 0) children = await search(`"Epic Link" = "${epicKey}" ORDER BY created ASC`);
  logger.info({ epicKey, childCount: children.length }, '[jira-input] fetched epic children');
  return children;
}

/** Downloads an attachment and extracts its text via the existing parsers (.md/.txt/.docx). Returns '' if unsupported/failed. */
export async function fetchAttachmentText(att: JiraAttachmentRef, config: AppConfig): Promise<string> {
  const { header } = auth(config);
  const res = await fetch(att.contentUrl, { headers: { Authorization: header } });
  if (!res.ok) {
    logger.warn({ filename: att.filename, status: res.status }, '[jira-input] attachment download failed — skipping');
    return '';
  }
  const dir = await mkdtemp(join(tmpdir(), 'sutra-jira-'));
  const file = join(dir, att.filename);
  try {
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    return await loadInputText(file);
  } catch (err) {
    logger.warn({ filename: att.filename, err }, '[jira-input] could not parse attachment — skipping');
    return '';
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
