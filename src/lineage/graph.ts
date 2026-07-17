import { ulid } from 'ulid';
import type { LineageCreator, LineageGraph, LineageId, LineageNode, LineageNodeType } from './types.js';

export function createGraph(input: { inputSourceFile: string; inputType: 'brd' | 'user-story'; inputHash: string }): LineageGraph {
  return {
    runId: ulid(),
    inputSourceFile: input.inputSourceFile,
    inputType: input.inputType,
    inputHash: input.inputHash,
    createdAt: new Date().toISOString(),
    nodes: {},
  };
}

export interface AddNodeInput<M extends Record<string, unknown>> {
  type: LineageNodeType;
  parentIds: LineageId[];
  createdBy: LineageCreator;
  payloadRef: string;
  metadata?: M;
  supersedes?: LineageId;
  clauseId?: string;
}

/** Adds a node and returns its generated id. Throws if a parent id doesn't exist yet. */
export function addNode<M extends Record<string, unknown> = Record<string, unknown>>(
  graph: LineageGraph,
  input: AddNodeInput<M>,
): LineageId {
  for (const parentId of input.parentIds) {
    if (!graph.nodes[parentId]) {
      throw new Error(
        `Lineage error: cannot add ${input.type} node with parent "${parentId}" — parent does not exist in the graph. ` +
          `This would create a dangling reference.`,
      );
    }
  }

  const id = ulid();
  const node: LineageNode<M> = {
    id,
    type: input.type,
    parentIds: input.parentIds,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    status: 'active',
    supersedes: input.supersedes,
    payloadRef: input.payloadRef,
    clauseId: input.clauseId,
    metadata: input.metadata ?? ({} as M),
  };
  graph.nodes[id] = node;
  return id;
}

export function getAncestors(graph: LineageGraph, id: LineageId): LineageNode[] {
  const result: LineageNode[] = [];
  const visited = new Set<LineageId>();
  const stack = [...(graph.nodes[id]?.parentIds ?? [])];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);
    const node = graph.nodes[currentId];
    if (!node) continue;
    result.push(node);
    stack.push(...node.parentIds);
  }
  return result;
}

export function getDescendants(graph: LineageGraph, id: LineageId): LineageNode[] {
  const children = Object.values(graph.nodes).filter((n) => n.parentIds.includes(id));
  const result: LineageNode[] = [...children];
  for (const child of children) {
    result.push(...getDescendants(graph, child.id));
  }
  return result;
}

/** All nodes tracing back to a given clause — used to markStale a whole clause's chain when it's deleted from the BRD. */
export function getNodesByClauseId(graph: LineageGraph, clauseId: string): LineageNode[] {
  return Object.values(graph.nodes).filter((n) => n.clauseId === clauseId);
}

/** Marks a node and everything downstream of it as stale (e.g. an upstream BRD clause changed). */
export function markStale(graph: LineageGraph, id: LineageId): void {
  const node = graph.nodes[id];
  if (!node) return;
  node.status = 'stale';
  for (const descendant of getDescendants(graph, id)) {
    graph.nodes[descendant.id]!.status = 'stale';
  }
}

/** Finds every node with no parents (roots — requirement-source nodes) and confirms every parentId resolves. */
export function validateGraph(graph: LineageGraph): { orphanParentRefs: string[]; roots: LineageId[] } {
  const orphanParentRefs: string[] = [];
  for (const node of Object.values(graph.nodes)) {
    for (const parentId of node.parentIds) {
      if (!graph.nodes[parentId]) {
        orphanParentRefs.push(`${node.id} -> missing parent ${parentId}`);
      }
    }
  }
  const roots = Object.values(graph.nodes)
    .filter((n) => n.parentIds.length === 0)
    .map((n) => n.id);
  return { orphanParentRefs, roots };
}

/** Walks from a leaf node back to its requirement-source root(s) — the "trace any result back to the BRD sentence" path. */
export function traceToSource(graph: LineageGraph, id: LineageId): LineageNode[] {
  const ancestors = getAncestors(graph, id);
  return ancestors.filter((n) => n.type === 'requirement-source');
}
