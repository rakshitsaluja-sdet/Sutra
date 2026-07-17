import { describe, expect, it } from 'vitest';
import { addNode, createGraph, getAncestors, getDescendants, getNodesByClauseId, markStale, traceToSource, validateGraph } from './graph.js';

function seed() {
  const g = createGraph({ inputSourceFile: 'x.md', inputType: 'brd', inputHash: 'h' });
  const src = addNode(g, { type: 'requirement-source', parentIds: [], createdBy: 'requirement-analyst', payloadRef: 'r', clauseId: 'c1' });
  const story = addNode(g, { type: 'user-story', parentIds: [src], createdBy: 'requirement-analyst', payloadRef: 's', clauseId: 'c1' });
  const test = addNode(g, { type: 'test-case', parentIds: [story], createdBy: 'test-case-designer', payloadRef: 't', clauseId: 'c1' });
  return { g, src, story, test };
}

describe('lineage graph', () => {
  it('adds nodes as active and rejects a dangling parent', () => {
    const g = createGraph({ inputSourceFile: 'x.md', inputType: 'brd', inputHash: 'h' });
    const id = addNode(g, { type: 'requirement-source', parentIds: [], createdBy: 'requirement-analyst', payloadRef: 'r' });
    expect(g.nodes[id]!.status).toBe('active');
    expect(() => addNode(g, { type: 'user-story', parentIds: ['does-not-exist'], createdBy: 'requirement-analyst', payloadRef: 's' })).toThrow(/parent/);
  });

  it('walks descendants and ancestors transitively', () => {
    const { g, src, test } = seed();
    expect(getDescendants(g, src).map((n) => n.id)).toContain(test);
    expect(getAncestors(g, test).map((n) => n.id)).toContain(src);
    expect(traceToSource(g, test).map((n) => n.id)).toEqual([src]);
  });

  it('markStale cascades from a node through all its descendants', () => {
    const { g, src, story, test } = seed();
    markStale(g, src);
    expect(g.nodes[src]!.status).toBe('stale');
    expect(g.nodes[story]!.status).toBe('stale');
    expect(g.nodes[test]!.status).toBe('stale');
  });

  it('markStale of a leaf does not affect its ancestors', () => {
    const { g, src, test } = seed();
    markStale(g, test);
    expect(g.nodes[test]!.status).toBe('stale');
    expect(g.nodes[src]!.status).toBe('active');
  });

  it('getNodesByClauseId returns every node tracing to a clause', () => {
    const { g } = seed();
    expect(getNodesByClauseId(g, 'c1')).toHaveLength(3);
    expect(getNodesByClauseId(g, 'nope')).toHaveLength(0);
  });

  it('validateGraph flags dangling parent references and finds roots', () => {
    const { g, src } = seed();
    // Hand-inject a corrupt node (addNode would refuse this) to prove detection.
    g.nodes['bad'] = { id: 'bad', type: 'test-case', parentIds: ['ghost'], createdAt: 'now', createdBy: 'test-case-designer', status: 'active', payloadRef: 'p', metadata: {} };
    const v = validateGraph(g);
    expect(v.orphanParentRefs.some((r) => r.includes('ghost'))).toBe(true);
    expect(v.roots).toContain(src);
  });
});
