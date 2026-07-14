import { traceToSource } from '../../lineage/graph.js';
import type { LineageGraph, LineageId } from '../../lineage/types.js';
import { writeFileEnsuringDir } from '../../utils/fsSafe.js';
import type { TestOutcome } from './readResults.js';

const REPORT_PATH = 'test-results/summary.md';

/** Writes a human-readable summary that traces every result back to its originating BRD/user-story sentence. */
export async function generateReport(graph: LineageGraph, featureLineageId: LineageId, outcomes: TestOutcome[]): Promise<string> {
  const sourceNodes = traceToSource(graph, featureLineageId);
  const sourceText =
    sourceNodes.map((n) => `- \`${n.payloadRef}\` (${n.metadata.inputType ?? 'source'})`).join('\n') ||
    '- (no requirement-source node found in lineage — this should not happen)';

  const lines = [
    '# QA Pipeline Run Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Results',
    ...(outcomes.length > 0 ? outcomes.map((o) => `- ${o.passed ? 'PASS' : 'FAIL'} — ${o.title}`) : ['- (no test results parsed)']),
    '',
    '## Traceability',
    'This run traces back to:',
    sourceText,
  ];

  await writeFileEnsuringDir(REPORT_PATH, lines.join('\n'));
  return REPORT_PATH;
}
