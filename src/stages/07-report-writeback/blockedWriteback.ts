import type { AppConfig } from '../../../config/env.js';
import { addNode } from '../../lineage/graph.js';
import type { LineageGraph, LineageId } from '../../lineage/types.js';
import { logger } from '../../utils/logger.js';
import type { SyncedTestCase } from '../03-jira-xray-sync/agent.js';
import type { BlockedGrounding } from '../04-script-generator/agent.js';
import { importKiwiResults } from './kiwiResultsImport.js';
import { importExecutionResults } from './xrayResultsImport.js';

/**
 * Records a grounding-safety BLOCKED outcome. The feature could not be honestly
 * tested (target unreachable, or the model reported it isn't implemented), so no
 * sandbox run happened. Writes a BLOCKED status to the backend — never a fake
 * pass or fail — and records it in the lineage so it surfaces for a human rather
 * than silently disappearing.
 */
export async function runBlockedWriteback(
  primary: SyncedTestCase,
  blocked: BlockedGrounding,
  testPlanIssueId: string | undefined,
  graph: LineageGraph,
  config: AppConfig,
): Promise<LineageId> {
  logger.warn(
    { testCaseId: primary.testCase.id, kind: blocked.kind, reason: blocked.reason },
    '[report-writeback] test BLOCKED by grounding-safety — recording as BLOCKED, not executing',
  );

  let payloadRef = 'blocked';
  try {
    if (config.backend === 'kiwi' && testPlanIssueId && primary.xrayIssueId) {
      const r = await importKiwiResults(
        { planId: testPlanIssueId, caseId: primary.xrayIssueId, status: 'BLOCKED', summary: `Sutra run ${graph.runId} — BLOCKED (${blocked.kind})` },
        config,
      );
      payloadRef = r.payloadRef;
    } else {
      const r = await importExecutionResults(
        {
          testExecutionSummary: `Sutra run — BLOCKED (${blocked.kind})`,
          projectKey: config.xray.projectKey ?? 'STUB',
          results: [{ testKey: primary.xrayKey, status: 'BLOCKED', comment: blocked.reason }],
        },
        config,
      );
      payloadRef = r.payloadRef;
    }
  } catch (err) {
    logger.error({ err }, '[report-writeback] failed to write BLOCKED status to the backend — the block is still recorded in lineage');
  }

  return addNode(graph, {
    type: 'xray-execution-result',
    parentIds: [primary.xrayLineageId],
    createdBy: 'report-writeback',
    payloadRef,
    metadata: { mode: config.backend, blocked: true, kind: blocked.kind, reason: blocked.reason },
  });
}
