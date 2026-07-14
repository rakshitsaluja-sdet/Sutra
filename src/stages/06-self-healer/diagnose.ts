export type FailureClass = 'likely-drift' | 'likely-regression' | 'unknown';

/**
 * Heuristic-only for Milestone 1 — a real accessibility-tree diff against
 * the live app (via Playwright MCP) is deferred to a later milestone. This
 * gives a best-effort signal from the test output alone, but the Self-Healer
 * stage does NOT act on it yet: every failure is still flagged for human
 * review, never auto-repaired or silently masked, until that real diffing
 * logic exists.
 */
export function classifyFailure(combinedOutput: string): FailureClass {
  const driftSignals = /locator.*not found|waiting for selector|element is not attached|strict mode violation/i;
  const regressionSignals = /expect\(.*\)\.toBe|assertion failed|tohavetext|toequal/i;

  if (driftSignals.test(combinedOutput)) return 'likely-drift';
  if (regressionSignals.test(combinedOutput)) return 'likely-regression';
  return 'unknown';
}
