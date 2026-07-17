import type { AppConfig } from '../../../config/env.js';
import { addNode } from '../../lineage/graph.js';
import type { LineageGraph, LineageId } from '../../lineage/types.js';
import { logger } from '../../utils/logger.js';
import type { SyncedTestCase } from '../03-jira-xray-sync/agent.js';
import { resolveIssueId } from '../03-jira-xray-sync/jiraRestClient.js';
import { buildXraySyncPort } from '../03-jira-xray-sync/agent.js';
import type { SandboxRunResult } from '../05-sandbox-runner/runner.js';
import { archiveRun } from './archiveRun.js';
import { readSandboxResults } from './readResults.js';
import { generateReport } from './reportGenerator.js';
import { attachEvidenceToTestRun } from './xrayEvidence.js';
import { importExecutionResults } from './xrayResultsImport.js';
import { importKiwiResults } from './kiwiResultsImport.js';

export interface ReportWritebackResult {
  reportPath: string;
  reportLineageId: LineageId;
  xrayResultLineageId: LineageId;
  archiveZipPath: string;
}

export async function runReportWriteback(
  run: SandboxRunResult,
  featureLineageId: LineageId,
  primary: SyncedTestCase,
  testPlanIssueId: string | undefined,
  graph: LineageGraph,
  config: AppConfig,
): Promise<ReportWritebackResult> {
  const outcomes = await readSandboxResults(run.resultsJsonPath).catch((err: unknown) => {
    logger.warn({ err }, '[report-writeback] could not parse sandbox results.json — report will note this');
    return [];
  });

  const reportPath = await generateReport(graph, featureLineageId, outcomes);
  const { zipPath: archiveZipPath } = await archiveRun(graph.runId);

  const reportLineageId = addNode(graph, {
    type: 'report',
    parentIds: [featureLineageId],
    createdBy: 'report-writeback',
    payloadRef: reportPath,
    metadata: { htmlReportPath: run.htmlReportPath, archiveZipPath },
  });

  let resultPayloadRef: string;
  let resultMode: string;
  let resultKey: string | undefined;

  if (config.backend === 'kiwi') {
    // Kiwi results path: a TestRun with the primary case's pass/fail + evidence link.
    if (testPlanIssueId && primary.xrayIssueId) {
      const kiwiResult = await importKiwiResults(
        {
          planId: testPlanIssueId,
          caseId: primary.xrayIssueId,
          passed: run.passed,
          summary: `Sutra run ${graph.runId} — ${run.passed ? 'PASSED' : 'FAILED'}`,
          evidenceZipPath: archiveZipPath,
        },
        config,
      ).catch((err: unknown) => {
        logger.error({ err }, '[report-writeback] (kiwi) results import failed');
        return undefined;
      });
      resultPayloadRef = kiwiResult?.payloadRef ?? 'kiwi:results-import-failed';
      resultKey = kiwiResult?.runKey;
    } else {
      logger.warn('[report-writeback] (kiwi) missing plan or case id — skipping results import');
      resultPayloadRef = 'kiwi:results-skipped';
    }
    resultMode = 'kiwi';
  } else {
    const importResult = await importExecutionResults(
      {
        testExecutionSummary: `Automated run — ${new Date().toISOString()}`,
        projectKey: config.xray.projectKey ?? 'STUB',
        results: [{ testKey: primary.xrayKey, status: run.passed ? 'PASSED' : 'FAILED' }],
      },
      config,
    );

    if (importResult.mode === 'live' && importResult.testExecutionKey) {
      try {
        const execIssueId = await resolveIssueId(importResult.testExecutionKey, config);

        if (testPlanIssueId) {
          const port = buildXraySyncPort(config);
          await port.linkTestExecutionToPlan(testPlanIssueId, execIssueId);
        }

        await attachEvidenceToTestRun({ testIssueKey: primary.xrayKey, execIssueId, zipPath: archiveZipPath }, config);
      } catch (err) {
        // Both are enrichment on top of the pass/fail status write-back that already succeeded
        // above — never fail the whole pipeline run over them, just flag it loudly.
        logger.error({ err }, '[report-writeback] failed to link execution to test plan and/or attach evidence — status was still recorded');
      }
    }

    resultPayloadRef = importResult.payloadRef;
    resultMode = importResult.mode;
    resultKey = importResult.testExecutionKey;
  }

  const xrayResultLineageId = addNode(graph, {
    type: 'xray-execution-result',
    parentIds: [reportLineageId],
    createdBy: 'report-writeback',
    payloadRef: resultPayloadRef,
    metadata: { mode: resultMode, testExecutionKey: resultKey },
  });

  logger.info({ reportPath, archiveZipPath, xrayResultLineageId }, '[report-writeback] complete');

  return { reportPath, reportLineageId, xrayResultLineageId, archiveZipPath };
}
