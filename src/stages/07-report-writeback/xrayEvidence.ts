import { GraphQLClient, gql } from 'graphql-request';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { AppConfig } from '../../../config/env.js';
import { resolveIssueId } from '../03-jira-xray-sync/jiraRestClient.js';
import { authenticateXray } from '../03-jira-xray-sync/xrayAuth.js';
import { logger } from '../../utils/logger.js';

const GRAPHQL_URL = 'https://xray.cloud.getxray.app/api/v2/graphql';

const GET_TEST_RUN = gql`
  query GetTestRun($testIssueId: String!, $testExecIssueId: String!) {
    getTestRun(testIssueId: $testIssueId, testExecIssueId: $testExecIssueId) {
      id
    }
  }
`;

const ADD_EVIDENCE = gql`
  mutation AddEvidence($id: String!, $evidence: [AttachmentDataInput]!) {
    addEvidenceToTestRun(id: $id, evidence: $evidence) {
      addedEvidence
      warnings
    }
  }
`;

export interface AttachEvidenceInput {
  testIssueKey: string;
  /** Pre-resolved numeric issue id of the Test Execution — resolve once in the caller and reuse for linkTestExecutionToPlan too, rather than resolving twice. */
  execIssueId: string;
  zipPath: string;
}

/**
 * Attaches the zipped run archive (HTML + Allure reports, results.json,
 * summary.md) as evidence on the Xray Test Run. Requires plain Jira REST
 * credentials (key->issueId resolution) *and* Xray client credentials
 * (GraphQL) — two distinct auth mechanisms. Live-mode only.
 *
 * Unverified against a live account — the GraphQL field names here are
 * taken from Xray's published docs (getTestRun / addEvidenceToTestRun /
 * AttachmentDataInput) but have not been exercised against a real project.
 * Confirm before relying on this in production.
 */
export async function attachEvidenceToTestRun(input: AttachEvidenceInput, config: AppConfig): Promise<void> {
  const testIssueId = await resolveIssueId(input.testIssueKey, config);
  const execIssueId = input.execIssueId;

  const token = await authenticateXray(config);
  const client = new GraphQLClient(GRAPHQL_URL, { headers: { Authorization: `Bearer ${token}` } });

  const runData = await client.request<{ getTestRun: { id: string } | null }>(GET_TEST_RUN, {
    testIssueId,
    testExecIssueId: execIssueId,
  });
  const testRunId = runData.getTestRun?.id;
  if (!testRunId) {
    logger.warn({ testIssueId, execIssueId }, '[report-writeback] no test run found — skipping evidence attachment');
    return;
  }

  const zipBuffer = await readFile(input.zipPath);
  await client.request(ADD_EVIDENCE, {
    id: testRunId,
    evidence: [{ filename: basename(input.zipPath), mimeType: 'application/zip', data: zipBuffer.toString('base64') }],
  });

  logger.info({ testRunId, zipPath: input.zipPath }, '[report-writeback] evidence attached to Xray test run');
}
