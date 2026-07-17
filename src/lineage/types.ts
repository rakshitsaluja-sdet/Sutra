export type LineageId = string; // ULID

/**
 * 'requirement-source' covers both a decomposed BRD clause AND a directly
 * supplied user story's raw text — Stage 1 auto-detects which one it got,
 * but both converge on the same lineage shape from this point down.
 */
export type LineageNodeType =
  | 'requirement-source'
  | 'user-story'
  | 'test-case'
  | 'xray-test-issue'
  | 'xray-test-set'
  | 'xray-test-plan'
  | 'script-feature'
  | 'script-step-def'
  | 'script-page-object'
  | 'sandbox-run'
  | 'heal-attempt'
  | 'promoted-run'
  | 'report'
  | 'xray-execution-result';

export type LineageStatus = 'active' | 'stale' | 'superseded' | 'deprecated';

export type LineageCreator =
  | 'requirement-analyst'
  | 'test-case-designer'
  | 'jira-xray-sync'
  | 'script-generator'
  | 'sandbox-runner'
  | 'self-healer'
  | 'report-writeback'
  | 'human';

export interface LineageNode<M extends Record<string, unknown> = Record<string, unknown>> {
  id: LineageId;
  type: LineageNodeType;
  /** Many-to-many: e.g. a test case may trace to more than one acceptance criterion. */
  parentIds: LineageId[];
  createdAt: string;
  createdBy: LineageCreator;
  status: LineageStatus;
  /** Set when this node was regenerated after an upstream change. */
  supersedes?: LineageId;
  /** Pointer at the real artifact (file path, Xray key, run id) — the graph stays small and diffable. */
  payloadRef: string;
  /** Which BRD clause (or 'root' for user-story mode) this node traces back to — cheap querying without digging through metadata. */
  clauseId?: string;
  metadata: M;
}

export interface LineageGraph {
  runId: LineageId;
  inputSourceFile: string;
  inputType: 'brd' | 'user-story';
  inputHash: string;
  createdAt: string;
  nodes: Record<LineageId, LineageNode>;
}
