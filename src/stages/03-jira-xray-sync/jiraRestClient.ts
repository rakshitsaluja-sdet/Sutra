import type { AppConfig } from '../../../config/env.js';

function basicAuthHeader(config: AppConfig): string {
  const { jiraEmail, jiraApiToken } = config.xray;
  if (!jiraEmail || !jiraApiToken) {
    throw new Error('[jira-xray-sync] Jira REST credentials (JIRA_EMAIL/API_TOKEN) are required for this operation.');
  }
  return `Basic ${Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')}`;
}

function requireBaseUrl(config: AppConfig): string {
  if (!config.xray.jiraBaseUrl) {
    throw new Error('[jira-xray-sync] JIRA_BASE_URL is required for this operation.');
  }
  return config.xray.jiraBaseUrl;
}

/**
 * Resolves a Jira issue key (e.g. "XRAY-1234") to its internal numeric
 * issueId — several Xray GraphQL operations (getTestRun) key on issueId
 * rather than the human-readable key. Plain Jira REST + Basic Auth
 * (email:apiToken) — a different auth mechanism from Xray's own
 * client_id/secret OAuth flow used elsewhere in this stage.
 */
export async function resolveIssueId(issueKey: string, config: AppConfig): Promise<string> {
  const baseUrl = requireBaseUrl(config);
  const response = await fetch(`${baseUrl}/rest/api/2/issue/${issueKey}?fields=id`, {
    headers: { Authorization: basicAuthHeader(config), Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`[jira-xray-sync] failed to resolve issue id for ${issueKey}: ${response.status} ${await response.text()}`);
  }
  const json = (await response.json()) as { id: string };
  return json.id;
}

/** Adds a label to an issue (additive — does not touch existing labels), used to flag superseded Test issues without deleting them. */
export async function addLabel(issueKey: string, label: string, config: AppConfig): Promise<void> {
  const baseUrl = requireBaseUrl(config);
  const response = await fetch(`${baseUrl}/rest/api/2/issue/${issueKey}`, {
    method: 'PUT',
    headers: { Authorization: basicAuthHeader(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({ update: { labels: [{ add: label }] } }),
  });
  if (!response.ok) {
    throw new Error(`[jira-xray-sync] failed to add label "${label}" to ${issueKey}: ${response.status} ${await response.text()}`);
  }
}

/** Adds a comment to an issue, used to record why a Test issue was superseded. */
export async function addComment(issueKey: string, body: string, config: AppConfig): Promise<void> {
  const baseUrl = requireBaseUrl(config);
  const response = await fetch(`${baseUrl}/rest/api/2/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { Authorization: basicAuthHeader(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) {
    throw new Error(`[jira-xray-sync] failed to add comment to ${issueKey}: ${response.status} ${await response.text()}`);
  }
}
