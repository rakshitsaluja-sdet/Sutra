import type { AppConfig } from '../../../config/env.js';

const AUTH_URL = 'https://xray.cloud.getxray.app/api/v2/authenticate';

let cachedToken: Promise<string> | undefined;

/** Shared by the live Xray client (stage 3) and the results write-back (stage 7) — one token, cached for the run. */
export function authenticateXray(config: AppConfig): Promise<string> {
  if (!cachedToken) {
    cachedToken = fetchToken(config);
  }
  return cachedToken;
}

async function fetchToken(config: AppConfig): Promise<string> {
  const { clientId, clientSecret } = config.xray;
  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
  if (!response.ok) {
    throw new Error(`Xray authenticate failed: ${response.status} ${await response.text()}`);
  }
  // Response body is a JSON string literal (quoted token), not a JSON object.
  return (await response.json()) as string;
}
