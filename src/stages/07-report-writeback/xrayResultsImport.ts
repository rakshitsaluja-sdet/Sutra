import type { AppConfig } from '../../../config/env.js';
import { authenticateXray } from '../03-jira-xray-sync/xrayAuth.js';
import { writeFileEnsuringDir } from '../../utils/fsSafe.js';
import { logger } from '../../utils/logger.js';

/** BLOCKED = grounding-safety could not honestly test the feature (unreachable / not implemented). */
export type ExecStatus = 'PASSED' | 'FAILED' | 'BLOCKED';

export interface ExecutionResultInput {
  testExecutionSummary: string;
  projectKey: string;
  results: Array<{ testKey: string; status: ExecStatus; comment?: string }>;
}

// Xray Cloud ships no default "BLOCKED" status, but does ship "ABORTED" — map onto it for the live import.
const XRAY_STATUS: Record<ExecStatus, string> = { PASSED: 'PASSED', FAILED: 'FAILED', BLOCKED: 'ABORTED' };

export interface ExecutionImportResult {
  mode: 'stub' | 'live';
  testExecutionKey?: string;
  payloadRef: string;
}

// getxray.app (current docs domain) and xpand-it.com (older docs snapshot) both surface
// this endpoint at slightly different versions/hosts — using the v2/getxray.app host for
// consistency with the auth + GraphQL calls above, which are confirmed against live docs.
// Verify against a live account before relying on this in production.
const IMPORT_URL = 'https://xray.cloud.getxray.app/api/v2/import/execution';

export async function importExecutionResults(input: ExecutionResultInput, config: AppConfig): Promise<ExecutionImportResult> {
  if (config.xray.mode === 'stub') {
    const path = 'generated/lineage/xray-stub-results.json';
    await writeFileEnsuringDir(path, JSON.stringify(input, null, 2));
    logger.info({ path }, '[report-writeback] (stub) execution results recorded');
    return { mode: 'stub', payloadRef: path };
  }

  const token = await authenticateXray(config);
  const body = {
    info: { summary: input.testExecutionSummary, project: input.projectKey },
    tests: input.results.map((r) => ({ testKey: r.testKey, status: XRAY_STATUS[r.status], comment: r.comment ?? '' })),
  };

  const response = await fetch(IMPORT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`[report-writeback] Xray execution import failed: ${response.status} ${await response.text()}`);
  }
  const json = (await response.json()) as { key?: string };
  logger.info({ testExecutionKey: json.key }, '[report-writeback] (live) execution results imported');
  return { mode: 'live', testExecutionKey: json.key, payloadRef: IMPORT_URL };
}
