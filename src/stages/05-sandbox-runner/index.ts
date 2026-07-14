import type { AppConfig } from '../../../config/env.js';
import { addNode } from '../../lineage/graph.js';
import type { LineageGraph, LineageId } from '../../lineage/types.js';
import type { GeneratedScript } from '../04-script-generator/agent.js';
import { promoteIfPassed } from './promote.js';
import { runSandbox, type SandboxRunResult } from './runner.js';

export interface SandboxStageResult {
  sandboxRunLineageId: LineageId;
  promotedLineageId?: LineageId;
  run: SandboxRunResult;
}

export async function runSandboxRunner(script: GeneratedScript, graph: LineageGraph, config: AppConfig): Promise<SandboxStageResult> {
  const run = await runSandbox(config);

  const sandboxRunLineageId = addNode(graph, {
    type: 'sandbox-run',
    parentIds: [script.featureLineageId],
    createdBy: 'sandbox-runner',
    payloadRef: run.resultsJsonPath,
    metadata: { passed: run.passed, exitCode: run.exitCode, timedOut: run.timedOut },
  });

  const promotedLineageId = promoteIfPassed(graph, sandboxRunLineageId, run.passed);

  return { sandboxRunLineageId, promotedLineageId, run };
}

export { runSandbox } from './runner.js';
export type { SandboxRunResult } from './runner.js';
