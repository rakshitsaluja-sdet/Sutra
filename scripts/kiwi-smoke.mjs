// Kiwi TCMS connection smoke-test.
//
// Proves the pipeline can reach and authenticate against your self-hosted Kiwi
// before we build the real adapter. It does exactly two things:
//   1. Auth.login(username, password)  -> a session id  (proves creds + reachability)
//   2. an authenticated read using that session cookie   (proves API calls work)
//
// Usage (after `docker compose -f docker/kiwi/docker-compose.yml up -d` and
// `manage.py initial_setup`, with KIWI_* filled into .env):
//   node scripts/kiwi-smoke.mjs
//
// Kiwi serves https://localhost with a SELF-SIGNED cert, so for THIS local check
// we disable TLS verification. Never do this against a real remote host.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import 'dotenv/config';

const BASE = (process.env.KIWI_BASE_URL || 'https://localhost').replace(/\/+$/, '');
const USER = process.env.KIWI_USERNAME;
const PASS = process.env.KIWI_PASSWORD;
const RPC = `${BASE}/json-rpc/`;

let callId = 0;

async function rpc(method, params, sessionId) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { Cookie: `sessionid=${sessionId}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: ++callId }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${method}: non-JSON response (HTTP ${res.status}). First 200 chars:\n${text.slice(0, 200)}`);
  }
  if (body.error) throw new Error(`${method}: RPC error ${body.error.code} — ${body.error.message}`);
  return body.result;
}

async function main() {
  console.log(`[kiwi-smoke] target: ${RPC}`);
  if (!USER || !PASS) {
    console.error('[kiwi-smoke] ✗ KIWI_USERNAME / KIWI_PASSWORD are not set in .env — fill them in first.');
    process.exit(2);
  }

  // 1) Login
  let sessionId;
  try {
    sessionId = await rpc('Auth.login', [USER, PASS]);
  } catch (err) {
    console.error(`[kiwi-smoke] ✗ login failed: ${err.message}`);
    console.error('           Is the container up? Try: docker ps | grep kiwi_web');
    console.error('           Did you run: docker exec -it kiwi_web /Kiwi/manage.py initial_setup ?');
    process.exit(1);
  }
  console.log(`[kiwi-smoke] ✓ Auth.login OK — session id: ${String(sessionId).slice(0, 8)}…`);

  // 2) An authenticated read, to prove API calls (not just login) work.
  //    Product.filter is a stable, always-present method; empty filter = list all.
  try {
    const products = await rpc('Product.filter', [{}], sessionId);
    console.log(`[kiwi-smoke] ✓ Product.filter OK — ${products.length} product(s) currently in Kiwi`);
  } catch (err) {
    // Non-fatal: login already proved connectivity + auth; surface the detail.
    console.warn(`[kiwi-smoke] ! authenticated read failed (login still succeeded): ${err.message}`);
  }

  console.log('[kiwi-smoke] ✓ Kiwi is reachable and your credentials work. Ready for the adapter.');
}

main().catch((err) => {
  console.error(`[kiwi-smoke] ✗ unexpected error: ${err.message}`);
  process.exit(1);
});
