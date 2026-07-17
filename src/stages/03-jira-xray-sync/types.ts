import type { TestCase } from '../02-test-case-designer/schema.js';

/** Which test-management backend a run targets. Also the namespace key for cache/registry state. */
export type SyncMode = 'stub' | 'live' | 'kiwi';

export interface XrayTestIssueRef {
  /** Jira issue key, e.g. "XRAY-1234", or a fabricated "STUB-TC-1" key in stub mode. */
  key: string;
  issueId?: string;
  url?: string;
}

export interface PushTestCaseInput {
  projectKey: string;
  storyId: string;
  testCase: TestCase;
}

export interface CreateGroupInput {
  projectKey: string;
  summary: string;
  testIssueIds: string[];
}

export interface SupersedeTestIssueInput {
  oldKey: string;
  oldIssueId?: string;
  /** Unset when the reason is 'clause-removed' — nothing replaced it, it was just retired. */
  newKey?: string;
  testSetIssueId?: string;
  reason: 'content-changed' | 'clause-removed';
}

/**
 * Behind this interface, live and stub implementations are interchangeable —
 * switching XRAY_MODE requires zero code changes anywhere that consumes this port.
 *
 * Grouping methods (Test Set / Test Plan) exist so one BRD/epic's test cases
 * are navigable as a collection in Jira, not scattered as loose Test issues —
 * and so every pipeline run's Test Execution rolls up into one persistent
 * Test Plan instead of each run being an orphaned, unlinked record.
 */
export interface XraySyncPort {
  readonly mode: SyncMode;
  pushTestCase(input: PushTestCaseInput): Promise<XrayTestIssueRef>;
  createTestSet(input: CreateGroupInput): Promise<XrayTestIssueRef>;
  addTestsToTestSet(testSetIssueId: string, testIssueIds: string[]): Promise<void>;
  createTestPlan(input: CreateGroupInput): Promise<XrayTestIssueRef>;
  linkTestExecutionToPlan(testPlanIssueId: string, testExecutionIssueId: string): Promise<void>;
  /** Never deletes — labels + comments the old issue and pulls it out of the active Test Set, preserving its history. */
  supersedeTestIssue(input: SupersedeTestIssueInput): Promise<void>;
  removeTestsFromTestSet(testSetIssueId: string, testIssueIds: string[]): Promise<void>;
}
