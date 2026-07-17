import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, resetConfigCache } from './env.js';

const KEYS = [
  'TCMS_BACKEND',
  'XRAY_MODE',
  'JIRA_BASE_URL',
  'JIRA_EMAIL',
  'JIRA_API_TOKEN',
  'XRAY_CLIENT_ID',
  'XRAY_CLIENT_SECRET',
  'XRAY_PROJECT_KEY',
  'KIWI_BASE_URL',
  'KIWI_USERNAME',
  'KIWI_PASSWORD',
  'KIWI_PRODUCT',
  'KIWI_TLS_INSECURE',
];

/** Run loadConfig() with ONLY the given backend-related env vars set (all others cleared). */
function withEnv(overrides: Record<string, string>): ReturnType<typeof loadConfig> {
  const saved: Record<string, string | undefined> = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, overrides);
  resetConfigCache();
  try {
    return loadConfig();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    resetConfigCache();
  }
}

const FULL_XRAY = {
  JIRA_BASE_URL: 'https://x.atlassian.net',
  JIRA_EMAIL: 'a@b.com',
  JIRA_API_TOKEN: 't',
  XRAY_CLIENT_ID: 'id',
  XRAY_CLIENT_SECRET: 'secret',
  XRAY_PROJECT_KEY: 'SUT',
};
const FULL_KIWI = { KIWI_BASE_URL: 'https://localhost', KIWI_USERNAME: 'admin', KIWI_PASSWORD: 'pw' };

afterEach(() => resetConfigCache());

describe('resolveBackend (never runs half-authenticated)', () => {
  it('defaults to stub with no backend and no creds', () => {
    expect(withEnv({}).backend).toBe('stub');
  });

  it('selects kiwi when TCMS_BACKEND=kiwi and creds are present', () => {
    const c = withEnv({ TCMS_BACKEND: 'kiwi', ...FULL_KIWI });
    expect(c.backend).toBe('kiwi');
    expect(c.kiwi?.baseUrl).toBe('https://localhost');
    expect(c.kiwi?.productName).toBe('Sutra'); // default when KIWI_PRODUCT unset
  });

  it('falls back to stub when kiwi is requested but creds are incomplete', () => {
    const c = withEnv({ TCMS_BACKEND: 'kiwi', KIWI_BASE_URL: 'https://localhost' }); // no user/pass
    expect(c.backend).toBe('stub');
    expect(c.kiwi).toBeUndefined();
  });

  it('falls back to stub when xray is requested but creds are incomplete', () => {
    expect(withEnv({ TCMS_BACKEND: 'xray', JIRA_BASE_URL: 'https://x.atlassian.net' }).backend).toBe('stub');
  });

  it('selects xray with full creds and marks xray.mode live', () => {
    const c = withEnv({ TCMS_BACKEND: 'xray', ...FULL_XRAY });
    expect(c.backend).toBe('xray');
    expect(c.xray.mode).toBe('live');
  });

  it('honours the legacy XRAY_MODE=live mapping when TCMS_BACKEND is unset', () => {
    expect(withEnv({ XRAY_MODE: 'live', ...FULL_XRAY }).backend).toBe('xray');
  });
});
