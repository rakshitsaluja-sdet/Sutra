import { resolve } from 'node:path';
import type { AppConfig } from '../../../config/env.js';
import { logger } from '../../utils/logger.js';
import { KiwiRpc } from '../03-jira-xray-sync/kiwiRpc.js';

// Verified against a fresh Kiwi instance's seed data.
const EXEC_STATUS_PASSED = 4;
const EXEC_STATUS_FAILED = 5;

export interface KiwiResultsInput {
  planId: string; // Kiwi TestPlan id
  caseId: string; // Kiwi TestCase id of the automated (primary) case
  passed: boolean;
  summary: string;
  evidenceZipPath: string;
}

export interface KiwiResultsOutput {
  payloadRef: string;
  runKey: string;
}

/**
 * Posts the execution result into Kiwi: creates a TestRun under the BRD's
 * TestPlan, adds the automated case, sets its execution status PASSED/FAILED,
 * and records a pointer to the local evidence archive. This is the Kiwi
 * equivalent of Xray's Test Execution import (kept out of XraySyncPort because
 * results-import is a stage-7 concern, not part of the sync surface).
 */
export async function importKiwiResults(input: KiwiResultsInput, config: AppConfig): Promise<KiwiResultsOutput> {
  const kiwi = config.kiwi!;
  const rpc = new KiwiRpc(kiwi.baseUrl, kiwi.username, kiwi.password, kiwi.tlsInsecure);
  await rpc.login();

  const [plan] = await rpc.call<Array<{ id: number; product_version: number }>>('TestPlan.filter', [{ id: Number(input.planId) }]);
  if (!plan) throw new Error(`Kiwi TestPlan ${input.planId} not found — cannot record results`);

  const [me] = await rpc.call<Array<{ id: number }>>('User.filter', [{ username: kiwi.username }]);

  // Ensure a build under the plan's version.
  const existingBuilds = await rpc.call<Array<{ id: number }>>('Build.filter', [{ version: plan.product_version, name: 'unspecified' }]);
  const buildId = existingBuilds.length > 0 ? existingBuilds[0]!.id : (await rpc.call<{ id: number }>('Build.create', [{ name: 'unspecified', version: plan.product_version }])).id;

  const run = await rpc.call<{ id: number }>('TestRun.create', [
    {
      summary: input.summary,
      plan: plan.id,
      build: buildId,
      manager: me!.id,
      product_version: plan.product_version,
    },
  ]);

  // Adding a case to the run creates its TestExecution(s); set the status on each.
  const executions = await rpc.call<Array<{ id: number }> | { id: number }>('TestRun.add_case', [run.id, Number(input.caseId)]);
  const execList = Array.isArray(executions) ? executions : [executions];
  const status = input.passed ? EXEC_STATUS_PASSED : EXEC_STATUS_FAILED;
  for (const exec of execList) {
    await rpc.call('TestExecution.update', [exec.id, { status }]).catch((err: unknown) => logger.warn({ err }, '[report-writeback] (kiwi) status update failed'));
  }

  // Evidence is best-effort: a local archive has no served URL, so record its
  // path as a comment on the execution rather than a (rejected) file:// link.
  const evidenceNote = `Sutra evidence archive: ${resolve(input.evidenceZipPath)}`;
  for (const exec of execList) {
    await rpc
      .call('TestExecution.add_comment', [exec.id, evidenceNote])
      .catch((err: unknown) => logger.warn({ err }, '[report-writeback] (kiwi) evidence comment failed (non-fatal)'));
  }

  await rpc.logout();
  logger.info({ runId: run.id, status: input.passed ? 'PASSED' : 'FAILED' }, '[report-writeback] (kiwi) test run recorded');
  return { payloadRef: `kiwi:testrun:${run.id}`, runKey: `KIWI-RUN-${run.id}` };
}
