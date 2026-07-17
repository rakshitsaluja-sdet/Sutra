import { GraphQLClient, gql } from 'graphql-request';
import type { AppConfig } from '../../../config/env.js';
import { logger } from '../../utils/logger.js';
import { addComment, addLabel } from './jiraRestClient.js';
import type { CreateGroupInput, PushTestCaseInput, SupersedeTestIssueInput, XraySyncPort, XrayTestIssueRef } from './types.js';
import { authenticateXray } from './xrayAuth.js';

const GRAPHQL_URL = 'https://xray.cloud.getxray.app/api/v2/graphql';

const CREATE_TEST_MUTATION = gql`
  mutation CreateManualTest($testType: UpdateTestTypeInput!, $steps: [CreateStepInput], $jira: JSON!) {
    createTest(testType: $testType, steps: $steps, jira: $jira) {
      test {
        issueId
        jira(fields: ["key"])
      }
      warnings
    }
  }
`;

const CREATE_TEST_SET_MUTATION = gql`
  mutation CreateTestSet($testIssueIds: [String], $jira: JSON!) {
    createTestSet(testIssueIds: $testIssueIds, jira: $jira) {
      testSet {
        issueId
        jira(fields: ["key"])
      }
      warnings
    }
  }
`;

const ADD_TESTS_TO_TEST_SET_MUTATION = gql`
  mutation AddTestsToTestSet($issueId: String!, $testIssueIds: [String]!) {
    addTestsToTestSet(issueId: $issueId, testIssueIds: $testIssueIds) {
      addedTests
      warning
    }
  }
`;

const CREATE_TEST_PLAN_MUTATION = gql`
  mutation CreateTestPlan($testIssueIds: [String], $jira: JSON!) {
    createTestPlan(testIssueIds: $testIssueIds, jira: $jira) {
      testPlan {
        issueId
        jira(fields: ["key"])
      }
      warnings
    }
  }
`;

const ADD_EXECUTIONS_TO_TEST_PLAN_MUTATION = gql`
  mutation AddExecutionsToTestPlan($issueId: String!, $testExecIssueIds: [String]!) {
    addTestExecutionsToTestPlan(issueId: $issueId, testExecIssueIds: $testExecIssueIds) {
      addedTestExecutions
      warning
    }
  }
`;

const REMOVE_TESTS_FROM_TEST_SET_MUTATION = gql`
  mutation RemoveTestsFromTestSet($issueId: String!, $testIssueIds: [String]!) {
    removeTestsFromTestSet(issueId: $issueId, testIssueIds: $testIssueIds)
  }
`;

interface CreateTestResponse {
  createTest: { test: { issueId: string; jira: { key: string } }; warnings: string[] };
}
interface CreateTestSetResponse {
  createTestSet: { testSet: { issueId: string; jira: { key: string } }; warnings: string[] };
}
interface CreateTestPlanResponse {
  createTestPlan: { testPlan: { issueId: string; jira: { key: string } }; warnings: string[] };
}

/**
 * Live Xray Cloud client. Auth flow, REST endpoint, and all five GraphQL
 * mutations below are verified against current Xray Cloud published docs
 * (docs.getxray.app, 2026-07) — but two specific cardinality details were
 * ambiguous in the fetched doc snapshots and should be confirmed against a
 * live GraphQL introspection query before production use:
 *   - createTest's `steps` field: action/data/result shown as `[String]` in
 *     one doc render, but every real-world example uses plain strings —
 *     this implementation uses plain strings.
 *   - createTestSet's `testIssueIds`: shown as `[[String]]` (nested array)
 *     in one doc render, but createTestPlan's identical-purpose field is
 *     `[String]` (flat) — this implementation uses flat, matching the
 *     unambiguous sibling mutation.
 */
export class XrayClient implements XraySyncPort {
  readonly mode = 'live' as const;

  constructor(private readonly config: AppConfig) {}

  private async client(): Promise<GraphQLClient> {
    const token = await authenticateXray(this.config);
    return new GraphQLClient(GRAPHQL_URL, { headers: { Authorization: `Bearer ${token}` } });
  }

  async pushTestCase(input: PushTestCaseInput): Promise<XrayTestIssueRef> {
    const client = await this.client();
    const steps = input.testCase.steps.map((s) => ({ action: s.step, data: '', result: s.expectedResult }));
    const variables = {
      testType: { name: 'Manual' },
      steps,
      jira: { fields: { summary: input.testCase.title, project: { key: input.projectKey } } },
    };

    const data = await client.request<CreateTestResponse>(CREATE_TEST_MUTATION, variables);
    if (data.createTest.warnings?.length) {
      logger.warn({ warnings: data.createTest.warnings }, '[jira-xray-sync] Xray createTest warnings');
    }
    const key = data.createTest.test.jira.key;
    logger.info({ key, testCaseId: input.testCase.id }, '[jira-xray-sync] (live) Xray test created');
    return { key, issueId: data.createTest.test.issueId, url: `${this.config.xray.jiraBaseUrl}/browse/${key}` };
  }

  async createTestSet(input: CreateGroupInput): Promise<XrayTestIssueRef> {
    const client = await this.client();
    const variables = {
      testIssueIds: input.testIssueIds,
      jira: { fields: { summary: input.summary, project: { key: input.projectKey } } },
    };
    const data = await client.request<CreateTestSetResponse>(CREATE_TEST_SET_MUTATION, variables);
    if (data.createTestSet.warnings?.length) {
      logger.warn({ warnings: data.createTestSet.warnings }, '[jira-xray-sync] Xray createTestSet warnings');
    }
    const key = data.createTestSet.testSet.jira.key;
    logger.info({ key, testCount: input.testIssueIds.length }, '[jira-xray-sync] (live) Xray test set created');
    return { key, issueId: data.createTestSet.testSet.issueId, url: `${this.config.xray.jiraBaseUrl}/browse/${key}` };
  }

  async addTestsToTestSet(testSetIssueId: string, testIssueIds: string[]): Promise<void> {
    if (testIssueIds.length === 0) return;
    const client = await this.client();
    await client.request(ADD_TESTS_TO_TEST_SET_MUTATION, { issueId: testSetIssueId, testIssueIds });
    logger.info({ testSetIssueId, addedCount: testIssueIds.length }, '[jira-xray-sync] (live) tests added to test set');
  }

  async createTestPlan(input: CreateGroupInput): Promise<XrayTestIssueRef> {
    const client = await this.client();
    const variables = {
      testIssueIds: input.testIssueIds,
      jira: { fields: { summary: input.summary, project: { key: input.projectKey } } },
    };
    const data = await client.request<CreateTestPlanResponse>(CREATE_TEST_PLAN_MUTATION, variables);
    if (data.createTestPlan.warnings?.length) {
      logger.warn({ warnings: data.createTestPlan.warnings }, '[jira-xray-sync] Xray createTestPlan warnings');
    }
    const key = data.createTestPlan.testPlan.jira.key;
    logger.info({ key, testCount: input.testIssueIds.length }, '[jira-xray-sync] (live) Xray test plan created');
    return { key, issueId: data.createTestPlan.testPlan.issueId, url: `${this.config.xray.jiraBaseUrl}/browse/${key}` };
  }

  async linkTestExecutionToPlan(testPlanIssueId: string, testExecutionIssueId: string): Promise<void> {
    const client = await this.client();
    await client.request(ADD_EXECUTIONS_TO_TEST_PLAN_MUTATION, {
      issueId: testPlanIssueId,
      testExecIssueIds: [testExecutionIssueId],
    });
    logger.info({ testPlanIssueId, testExecutionIssueId }, '[jira-xray-sync] (live) test execution linked to test plan');
  }

  async removeTestsFromTestSet(testSetIssueId: string, testIssueIds: string[]): Promise<void> {
    if (testIssueIds.length === 0) return;
    const client = await this.client();
    await client.request(REMOVE_TESTS_FROM_TEST_SET_MUTATION, { issueId: testSetIssueId, testIssueIds });
    logger.info({ testSetIssueId, removedCount: testIssueIds.length }, '[jira-xray-sync] (live) tests removed from test set');
  }

  /**
   * Never deletes. Xray Cloud's GraphQL API has no generic updateTest
   * mutation — editing steps/title in place would need a step-id-tracking
   * sequence (removeAllTestSteps + N x addTestStep) plus a separate Jira
   * REST call for the title, three extra API surfaces this codebase doesn't
   * otherwise need. Mark-superseded-and-create-new is simpler and preserves
   * the old issue's history, consistent with the lineage graph's own
   * never-delete-only-markStale philosophy.
   */
  async supersedeTestIssue(input: SupersedeTestIssueInput): Promise<void> {
    const label = input.reason === 'clause-removed' ? 'sutra-clause-removed' : 'sutra-superseded';
    const comment =
      input.reason === 'clause-removed'
        ? 'Superseded by Sutra — the source BRD clause this test traced back to was removed.'
        : input.newKey
          ? `Superseded by Sutra regeneration — see ${input.newKey}.`
          : 'Superseded by Sutra regeneration — its source clause changed and was fully regenerated; see the current test cases for that section.';

    await addLabel(input.oldKey, label, this.config);
    await addComment(input.oldKey, comment, this.config);

    if (input.testSetIssueId && input.oldIssueId) {
      await this.removeTestsFromTestSet(input.testSetIssueId, [input.oldIssueId]);
    } else if (input.testSetIssueId) {
      logger.warn({ oldKey: input.oldKey }, '[jira-xray-sync] (live) no issueId on hand for superseded test — left in the active Test Set, cleanup will need a manual pass');
    }

    logger.info({ oldKey: input.oldKey, newKey: input.newKey, reason: input.reason }, '[jira-xray-sync] (live) test issue superseded');
  }
}
