import type { AppConfig } from '../../../config/env.js';
import { addNode } from '../../lineage/graph.js';
import type { LineageGraph, LineageId } from '../../lineage/types.js';
import { logger } from '../../utils/logger.js';
import type { DesignedTestCase } from '../02-test-case-designer/agent.js';
import { StubXrayClient } from './stubXrayClient.js';
import type { XraySyncPort } from './types.js';
import { XrayClient } from './xrayClient.js';
import { getRegistryEntry, registryKeyForInput, saveRegistryEntry } from './xrayRegistry.js';

export function buildXraySyncPort(config: AppConfig): XraySyncPort {
  return config.xray.mode === 'live' ? new XrayClient(config) : new StubXrayClient();
}

export interface SyncedTestCase extends DesignedTestCase {
  xrayLineageId: LineageId;
  xrayKey: string;
  xrayIssueId?: string;
}

/**
 * Pushes only the given (newly designed) test cases to Xray as linked Test
 * issues. Cache-unaware by design — the caller (pipeline.ts) only invokes
 * this for cache-miss clauses; cache-hit test cases are reconstructed
 * straight from the clause cache and never touch this function.
 */
export async function pushTestCases(
  testCases: DesignedTestCase[],
  clauseId: string,
  graph: LineageGraph,
  config: AppConfig,
  port: XraySyncPort,
): Promise<SyncedTestCase[]> {
  const projectKey = config.xray.projectKey ?? 'STUB';
  const results: SyncedTestCase[] = [];

  for (const designed of testCases) {
    const ref = await port.pushTestCase({ projectKey, storyId: designed.storyId, testCase: designed.testCase });

    const xrayLineageId = addNode(graph, {
      type: 'xray-test-issue',
      parentIds: [designed.lineageId],
      createdBy: 'jira-xray-sync',
      payloadRef: ref.key,
      clauseId,
      metadata: { mode: port.mode, url: ref.url },
    });

    results.push({ ...designed, xrayLineageId, xrayKey: ref.key, xrayIssueId: ref.issueId });
  }

  logger.info({ count: results.length, mode: port.mode }, '[jira-xray-sync] test cases synced');
  return results;
}

export interface TestSetAndPlanResult {
  testSetKey: string;
  testSetIssueId?: string;
  testPlanKey: string;
  testPlanIssueId?: string;
  reused: boolean;
}

/**
 * Guarantees exactly ONE lineage node per real Test Set/Plan across the graph's
 * whole life. On a reuse run the node already exists — we merge in any story
 * links added since (later clauses) rather than appending a duplicate node that
 * points at the same Jira object. Only creates one when genuinely absent (first
 * run, or a graph that was reset while the Xray registry persisted).
 */
function upsertGroupingNode(
  graph: LineageGraph,
  type: 'xray-test-set' | 'xray-test-plan',
  key: string,
  storyLineageIds: LineageId[],
  mode: 'stub' | 'live',
): void {
  const existingNode = Object.values(graph.nodes).find((n) => n.type === type && n.payloadRef === key);
  if (existingNode) {
    for (const sid of storyLineageIds) {
      if (graph.nodes[sid] && !existingNode.parentIds.includes(sid)) existingNode.parentIds.push(sid);
    }
    return;
  }
  addNode(graph, { type, parentIds: storyLineageIds, createdBy: 'jira-xray-sync', payloadRef: key, metadata: { mode } });
}

/**
 * Ensures one Test Set + Test Plan exists for this whole BRD/epic, reusing
 * an existing one across re-runs via the local registry instead of creating
 * duplicates. Called once per pipeline run (not per clause) with the full
 * set of currently-active test issue ids (hit + miss combined) and, separately,
 * just the ones that are new this run and need adding to an existing set.
 */
export async function ensureTestSetAndPlan(
  allActiveTestIssueIds: string[],
  newTestIssueIds: string[],
  storyLineageIds: LineageId[],
  graph: LineageGraph,
  config: AppConfig,
  port: XraySyncPort,
): Promise<TestSetAndPlanResult> {
  const projectKey = config.xray.projectKey ?? 'STUB';
  const registryKey = registryKeyForInput(graph.inputSourceFile, port.mode);
  const existing = await getRegistryEntry(registryKey);

  let testSetRef: { key: string; issueId?: string };
  let testPlanRef: { key: string; issueId?: string };

  if (existing) {
    testSetRef = { key: existing.testSetKey, issueId: existing.testSetIssueId };
    testPlanRef = { key: existing.testPlanKey, issueId: existing.testPlanIssueId };
    if (newTestIssueIds.length > 0 && existing.testSetIssueId) {
      await port.addTestsToTestSet(existing.testSetIssueId, newTestIssueIds);
    }
    logger.info({ testSetKey: testSetRef.key, testPlanKey: testPlanRef.key }, '[jira-xray-sync] reused existing Test Set/Plan for this input');
  } else {
    const summary = `Sutra — ${graph.inputSourceFile}`;
    testSetRef = await port.createTestSet({ projectKey, summary, testIssueIds: allActiveTestIssueIds });
    testPlanRef = await port.createTestPlan({ projectKey, summary, testIssueIds: allActiveTestIssueIds });

    if (testSetRef.issueId && testPlanRef.issueId) {
      await saveRegistryEntry(registryKey, {
        testSetKey: testSetRef.key,
        testSetIssueId: testSetRef.issueId,
        testPlanKey: testPlanRef.key,
        testPlanIssueId: testPlanRef.issueId,
        createdAt: new Date().toISOString(),
      });
    }
    logger.info({ testSetKey: testSetRef.key, testPlanKey: testPlanRef.key }, '[jira-xray-sync] created new Test Set/Plan for this input');
  }

  // One grouping node per real Test Set/Plan for the lifetime of the graph. On a
  // reuse run we must NOT addNode a fresh one each time (that leaks a duplicate
  // node per run all pointing at the same Jira object) — instead find the existing
  // node and merge in any story links added since, so later clauses still trace up.
  upsertGroupingNode(graph, 'xray-test-set', testSetRef.key, storyLineageIds, port.mode);
  upsertGroupingNode(graph, 'xray-test-plan', testPlanRef.key, storyLineageIds, port.mode);

  return {
    testSetKey: testSetRef.key,
    testSetIssueId: testSetRef.issueId,
    testPlanKey: testPlanRef.key,
    testPlanIssueId: testPlanRef.issueId,
    reused: Boolean(existing),
  };
}

/** Supersedes every previously-cached test case for a clause that changed or was removed — never deletes, marks and unlists instead. */
export async function supersedeClauseTestCases(
  oldTestCases: Array<{ xrayKey: string; xrayIssueId?: string }>,
  testSetIssueId: string | undefined,
  reason: 'content-changed' | 'clause-removed',
  config: AppConfig,
  port: XraySyncPort,
): Promise<void> {
  for (const old of oldTestCases) {
    await port.supersedeTestIssue({ oldKey: old.xrayKey, oldIssueId: old.xrayIssueId, testSetIssueId, reason });
  }
}
