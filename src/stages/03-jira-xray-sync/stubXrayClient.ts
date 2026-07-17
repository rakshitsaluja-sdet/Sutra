import { writeFileEnsuringDir } from '../../utils/fsSafe.js';
import { logger } from '../../utils/logger.js';
import type { CreateGroupInput, PushTestCaseInput, SupersedeTestIssueInput, XraySyncPort, XrayTestIssueRef } from './types.js';

const STUB_FILE = 'generated/lineage/xray-stub.json';

interface StubRecords {
  tests: Array<{ key: string; issueId: string; storyId: string; testCaseId: string; title: string }>;
  testSets: Array<{ key: string; issueId: string; summary: string; testIssueIds: string[] }>;
  testPlans: Array<{ key: string; issueId: string; summary: string; testIssueIds: string[] }>;
  testSetAdditions: Array<{ testSetIssueId: string; testIssueIds: string[] }>;
  testSetRemovals: Array<{ testSetIssueId: string; testIssueIds: string[] }>;
  planExecutionLinks: Array<{ testPlanIssueId: string; testExecutionIssueId: string }>;
  supersessions: SupersedeTestIssueInput[];
}

/**
 * No Jira/Xray credentials required. Fabricates stable keys and records every
 * "push" to a JSON file so a run can be inspected without live access —
 * downstream stages consume the same XraySyncPort interface either way.
 */
export class StubXrayClient implements XraySyncPort {
  readonly mode = 'stub' as const;
  private counter = 0;
  private readonly records: StubRecords = {
    tests: [],
    testSets: [],
    testPlans: [],
    testSetAdditions: [],
    testSetRemovals: [],
    planExecutionLinks: [],
    supersessions: [],
  };

  private nextIssueId(): string {
    this.counter += 1;
    return `9${this.counter.toString().padStart(5, '0')}`; // fake-but-stable numeric-looking id
  }

  private async persist(): Promise<void> {
    await writeFileEnsuringDir(STUB_FILE, JSON.stringify(this.records, null, 2));
  }

  async pushTestCase(input: PushTestCaseInput): Promise<XrayTestIssueRef> {
    // A real Jira/Xray assigns a globally-unique key per issue; mirror that with a
    // monotonic sequence. testCaseId alone collides (each story restarts at TC-1),
    // so the sequence suffix is what guarantees uniqueness while keeping the id readable.
    const key = `STUB-${input.testCase.id}-${this.records.tests.length + 1}`;
    const issueId = this.nextIssueId();
    this.records.tests.push({ key, issueId, storyId: input.storyId, testCaseId: input.testCase.id, title: input.testCase.title });
    await this.persist();
    logger.info({ key, testCaseId: input.testCase.id }, '[jira-xray-sync] (stub) test case recorded');
    return { key, issueId };
  }

  async createTestSet(input: CreateGroupInput): Promise<XrayTestIssueRef> {
    const key = `STUB-SET-${this.records.testSets.length + 1}`;
    const issueId = this.nextIssueId();
    this.records.testSets.push({ key, issueId, summary: input.summary, testIssueIds: input.testIssueIds });
    await this.persist();
    logger.info({ key, testCount: input.testIssueIds.length }, '[jira-xray-sync] (stub) test set created');
    return { key, issueId };
  }

  async addTestsToTestSet(testSetIssueId: string, testIssueIds: string[]): Promise<void> {
    this.records.testSetAdditions.push({ testSetIssueId, testIssueIds });
    await this.persist();
    logger.info({ testSetIssueId, addedCount: testIssueIds.length }, '[jira-xray-sync] (stub) tests added to test set');
  }

  async createTestPlan(input: CreateGroupInput): Promise<XrayTestIssueRef> {
    const key = `STUB-PLAN-${this.records.testPlans.length + 1}`;
    const issueId = this.nextIssueId();
    this.records.testPlans.push({ key, issueId, summary: input.summary, testIssueIds: input.testIssueIds });
    await this.persist();
    logger.info({ key, testCount: input.testIssueIds.length }, '[jira-xray-sync] (stub) test plan created');
    return { key, issueId };
  }

  async linkTestExecutionToPlan(testPlanIssueId: string, testExecutionIssueId: string): Promise<void> {
    this.records.planExecutionLinks.push({ testPlanIssueId, testExecutionIssueId });
    await this.persist();
    logger.info({ testPlanIssueId, testExecutionIssueId }, '[jira-xray-sync] (stub) test execution linked to test plan');
  }

  async supersedeTestIssue(input: SupersedeTestIssueInput): Promise<void> {
    this.records.supersessions.push(input);
    if (input.testSetIssueId && input.oldIssueId) {
      await this.removeTestsFromTestSet(input.testSetIssueId, [input.oldIssueId]);
    }
    await this.persist();
    logger.info({ oldKey: input.oldKey, newKey: input.newKey, reason: input.reason }, '[jira-xray-sync] (stub) test issue superseded');
  }

  async removeTestsFromTestSet(testSetIssueId: string, testIssueIds: string[]): Promise<void> {
    this.records.testSetRemovals.push({ testSetIssueId, testIssueIds });
    await this.persist();
    logger.info({ testSetIssueId, removedCount: testIssueIds.length }, '[jira-xray-sync] (stub) tests removed from test set');
  }
}
