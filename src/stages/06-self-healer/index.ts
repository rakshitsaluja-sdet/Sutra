import { addNode } from '../../lineage/graph.js';
import type { LineageGraph, LineageId } from '../../lineage/types.js';
import type { SandboxRunResult } from '../05-sandbox-runner/runner.js';
import { logger } from '../../utils/logger.js';
import { classifyFailure } from './diagnose.js';

export interface SelfHealerResult {
  attempted: boolean;
  healLineageId?: LineageId;
}

/**
 * Milestone 1 scope: diagnosis-only stub. Classifies the failure (best
 * effort, from test output text) but never attempts an automated repair —
 * that requires real accessibility-tree diffing via Playwright MCP, deferred
 * to a later milestone. Every failure is flagged for human review; nothing
 * is ever silently masked as a pass.
 */
export async function runSelfHealer(
  run: SandboxRunResult,
  sandboxRunLineageId: LineageId,
  graph: LineageGraph,
): Promise<SelfHealerResult> {
  if (run.passed) {
    return { attempted: false };
  }

  const classification = classifyFailure(`${run.stdout}\n${run.stderr}`);

  const healLineageId = addNode(graph, {
    type: 'heal-attempt',
    parentIds: [sandboxRunLineageId],
    createdBy: 'self-healer',
    payloadRef: run.resultsJsonPath,
    metadata: { status: 'skipped-stub', classification },
  });

  logger.warn(
    { classification, healLineageId },
    '[self-healer] failure flagged for human review — Milestone 1 does not attempt automated repair',
  );

  return { attempted: false, healLineageId };
}
