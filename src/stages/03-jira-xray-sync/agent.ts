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

export interface JiraXraySyncResult {
  testCases: SyncedTestCase[];
  testPlanKey?: string;
  testPlanIssueId?: string;
}

/**
 * Deterministic control flow, not an LLM call. Pushes each designed test
 * case to Xray (or its stub) as a linked Test issue, then groups all of
 * them under one Test Set + Test Plan for this BRD/epic — reusing an
 * existing Test Set/Plan across re-runs of the same input (via the local
 * registry) instead of creating duplicates every run.
 */
export async function runJiraXraySync(
  testCases: DesignedTestCase[],
  graph: LineageGraph,
  config: AppConfig,
  port: XraySyncPort = buildXraySyncPort(config),
): Promise<JiraXraySyncResult> {
  const projectKey = config.xray.projectKey ?? 'STUB';
  const results: SyncedTestCase[] = [];

  for (const designed of testCases) {
    const ref = await port.pushTestCase({ projectKey, storyId: designed.storyId, testCase: designed.testCase });

    const xrayLineageId = addNode(graph, {
      type: 'xray-test-issue',
      parentIds: [designed.lineageId],
      createdBy: 'jira-xray-sync',
      payloadRef: ref.key,
      metadata: { mode: port.mode, url: ref.url },
    });

    results.push({ ...designed, xrayLineageId, xrayKey: ref.key, xrayIssueId: ref.issueId });
  }

  logger.info({ count: results.length, mode: port.mode }, '[jira-xray-sync] test cases synced');

  const testIssueIds = results.map((r) => r.xrayIssueId).filter((id): id is string => Boolean(id));
  const storyLineageIds = [...new Set(results.map((r) => r.storyLineageId))];
  const registryKey = registryKeyForInput(graph.inputSourceFile, port.mode);
  const existing = await getRegistryEntry(registryKey);

  let testSetRef: { key: string; issueId?: string };
  let testPlanRef: { key: string; issueId?: string };

  if (existing) {
    testSetRef = { key: existing.testSetKey, issueId: existing.testSetIssueId };
    testPlanRef = { key: existing.testPlanKey, issueId: existing.testPlanIssueId };
    if (testIssueIds.length > 0) {
      await port.addTestsToTestSet(existing.testSetIssueId, testIssueIds);
    }
    logger.info(
      { testSetKey: testSetRef.key, testPlanKey: testPlanRef.key },
      '[jira-xray-sync] reused existing Test Set/Plan for this input',
    );
  } else {
    const summary = `Sutra — ${graph.inputSourceFile}`;
    testSetRef = await port.createTestSet({ projectKey, summary, testIssueIds });
    testPlanRef = await port.createTestPlan({ projectKey, summary, testIssueIds });

    if (testSetRef.issueId && testPlanRef.issueId) {
      await saveRegistryEntry(registryKey, {
        testSetKey: testSetRef.key,
        testSetIssueId: testSetRef.issueId,
        testPlanKey: testPlanRef.key,
        testPlanIssueId: testPlanRef.issueId,
        createdAt: new Date().toISOString(),
      });
    }
    logger.info(
      { testSetKey: testSetRef.key, testPlanKey: testPlanRef.key },
      '[jira-xray-sync] created new Test Set/Plan for this input',
    );
  }

  addNode(graph, {
    type: 'xray-test-set',
    parentIds: storyLineageIds,
    createdBy: 'jira-xray-sync',
    payloadRef: testSetRef.key,
    metadata: { mode: port.mode, reused: Boolean(existing) },
  });
  addNode(graph, {
    type: 'xray-test-plan',
    parentIds: storyLineageIds,
    createdBy: 'jira-xray-sync',
    payloadRef: testPlanRef.key,
    metadata: { mode: port.mode, reused: Boolean(existing) },
  });

  return { testCases: results, testPlanKey: testPlanRef.key, testPlanIssueId: testPlanRef.issueId };
}
