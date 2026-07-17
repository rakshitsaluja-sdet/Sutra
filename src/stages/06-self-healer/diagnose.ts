export type FailureClass = 'likely-drift' | 'likely-regression' | 'possibly-not-implemented' | 'unknown';

/**
 * Heuristic-only for Milestone 1 — a real accessibility-tree diff against
 * the live app (via Playwright MCP) is deferred to a later milestone. This
 * gives a best-effort signal from the test output alone, but the Self-Healer
 * stage does NOT act on it yet: every failure is still flagged for human
 * review, never auto-repaired or silently masked, until that real diffing
 * logic exists.
 */
export function classifyFailure(combinedOutput: string): FailureClass {
  // Most specific first: signals that the *feature itself* isn't there to test
  // (dead route, 404, DNS/connection failure) — distinct from a UI that drifted
  // or a real behavioural regression.
  const notImplementedSignals =
    /\b404\b|not found|this page could not be found|net::err_|err_name_not_resolved|econnrefused|no such route|page crashed|net::err_aborted/i;
  const driftSignals = /locator.*not found|waiting for selector|element is not attached|strict mode violation/i;
  const regressionSignals = /expect\(.*\)\.toBe|assertion failed|tohavetext|toequal/i;

  if (notImplementedSignals.test(combinedOutput)) return 'possibly-not-implemented';
  if (driftSignals.test(combinedOutput)) return 'likely-drift';
  if (regressionSignals.test(combinedOutput)) return 'likely-regression';
  return 'unknown';
}
