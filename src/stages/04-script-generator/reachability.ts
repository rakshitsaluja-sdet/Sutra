import { logger } from '../../utils/logger.js';

export interface ReachabilityResult {
  reachable: boolean;
  detail: string;
}

/**
 * Pre-flight check before spending an LLM grounding pass: is the target app
 * actually up? A server that responds at all (even 4xx) is "reachable" — a
 * missing *route* is the grounding step's job to detect, but a dead host, DNS
 * failure, or 5xx means there is nothing to ground against, so we should mark
 * the test BLOCKED instead of generating a hallucinated script.
 */
export async function checkReachable(url: string, timeoutMs = 10000): Promise<ReachabilityResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'follow' });
    const reachable = res.status < 500;
    logger.info({ url, status: res.status, reachable }, '[script-generator] reachability pre-flight');
    return { reachable, detail: `HTTP ${res.status}` };
  } catch (err) {
    const detail = (err as Error).name === 'AbortError' ? `timed out after ${timeoutMs}ms` : (err as Error).message;
    logger.warn({ url, detail }, '[script-generator] reachability pre-flight failed — target appears unreachable');
    return { reachable: false, detail };
  } finally {
    clearTimeout(timer);
  }
}
