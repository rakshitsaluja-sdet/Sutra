import type { AppConfig } from '../../../config/env.js';

/**
 * Resolves a Jira issue key (e.g. "XRAY-1234") to its internal numeric
 * issueId — several Xray GraphQL operations (getTestRun) key on issueId
 * rather than the human-readable key. Plain Jira REST + Basic Auth
 * (email:apiToken) — a different auth mechanism from Xray's own
 * client_id/secret OAuth flow used elsewhere in this stage.
 */
export async function resolveIssueId(issueKey: string, config: AppConfig): Promise<string> {
  const { jiraBaseUrl, jiraEmail, jiraApiToken } = config.xray;
  if (!jiraBaseUrl || !jiraEmail || !jiraApiToken) {
    throw new Error('[jira-xray-sync] Jira REST credentials (JIRA_BASE_URL/EMAIL/API_TOKEN) are required to resolve an issue id.');
  }
  const auth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');
  const response = await fetch(`${jiraBaseUrl}/rest/api/2/issue/${issueKey}?fields=id`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`[jira-xray-sync] failed to resolve issue id for ${issueKey}: ${response.status} ${await response.text()}`);
  }
  const json = (await response.json()) as { id: string };
  return json.id;
}
