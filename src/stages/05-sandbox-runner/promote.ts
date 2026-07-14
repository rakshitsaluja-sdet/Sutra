import { addNode } from '../../lineage/graph.js';
import type { LineageGraph, LineageId } from '../../lineage/types.js';
import { logger } from '../../utils/logger.js';

/**
 * Milestone 1 scope: "promotion" is a lineage marker, not a file move —
 * generated/ is already the canonical location. A later milestone can add
 * an actual copy/merge into a persistent shared-suite directory once one
 * exists.
 */
export function promoteIfPassed(graph: LineageGraph, sandboxRunLineageId: LineageId, passed: boolean): LineageId | undefined {
  if (!passed) {
    logger.info({ sandboxRunLineageId }, '[sandbox-runner] run failed — not promoted');
    return undefined;
  }
  const promotedId = addNode(graph, {
    type: 'promoted-run',
    parentIds: [sandboxRunLineageId],
    createdBy: 'sandbox-runner',
    payloadRef: sandboxRunLineageId,
    metadata: {},
  });
  logger.info({ promotedId }, '[sandbox-runner] run promoted');
  return promotedId;
}
