import { z } from 'zod';
import 'dotenv/config';

const rawSchema = z.object({
  // Optional: if unset, the Agent SDK falls back to an existing OAuth session
  // (e.g. ~/.claude/.credentials.json from a Claude Code / subscription login)
  // instead of a metered API key — same as the Claude Code CLI itself.
  ANTHROPIC_API_KEY: z.string().optional().or(z.literal('')),
  CLAUDE_MODEL: z.string().default('claude-sonnet-5'),

  JIRA_BASE_URL: z.string().url().optional().or(z.literal('')),
  JIRA_EMAIL: z.string().optional().or(z.literal('')),
  JIRA_API_TOKEN: z.string().optional().or(z.literal('')),
  XRAY_CLIENT_ID: z.string().optional().or(z.literal('')),
  XRAY_CLIENT_SECRET: z.string().optional().or(z.literal('')),
  XRAY_PROJECT_KEY: z.string().optional().or(z.literal('')),
  XRAY_MODE: z.enum(['stub', 'live']).default('stub'),

  // Test-management backend selector. When unset, derived from XRAY_MODE for
  // backward compat (live -> xray, stub -> stub). 'kiwi' targets a Kiwi TCMS.
  TCMS_BACKEND: z.enum(['stub', 'xray', 'kiwi']).optional().or(z.literal('')),
  KIWI_BASE_URL: z.string().optional().or(z.literal('')),
  KIWI_USERNAME: z.string().optional().or(z.literal('')),
  KIWI_PASSWORD: z.string().optional().or(z.literal('')),
  KIWI_PRODUCT: z.string().optional().or(z.literal('')),
  // Kiwi ships a self-signed cert on localhost; default to not verifying it.
  // Set to 'false' for a Kiwi behind a real, trusted certificate.
  KIWI_TLS_INSECURE: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  PLAYWRIGHT_MCP_HEADLESS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  SANDBOX_DOCKER_IMAGE: z.string().default('mcr.microsoft.com/playwright:v1.61.1-noble'),
  SANDBOX_TIMEOUT_MS: z
    .string()
    .default('120000')
    .transform((v) => Number.parseInt(v, 10)),

  TARGET_BASE_URL: z.string().url().default('https://the-internet.herokuapp.com'),

  // Optional: an existing test account's credentials, made available to the Script
  // Generator's prompt so it authenticates with real values instead of guessing or
  // fabricating them. Never used to register/create new accounts.
  TEST_USER_EMAIL: z.string().optional().or(z.literal('')),
  TEST_USER_PASSWORD: z.string().optional().or(z.literal('')),
});

type RawEnv = z.infer<typeof rawSchema>;

export interface AppConfig {
  /** Unset when relying on an existing OAuth session instead of a metered API key. */
  anthropicApiKey?: string;
  claudeModel: string;
  /** Which test-management backend this run targets — drives buildXraySyncPort. */
  backend: 'stub' | 'xray' | 'kiwi';
  xray: {
    mode: 'stub' | 'live';
    jiraBaseUrl?: string;
    jiraEmail?: string;
    jiraApiToken?: string;
    clientId?: string;
    clientSecret?: string;
    projectKey?: string;
  };
  kiwi?: {
    baseUrl: string;
    username: string;
    password: string;
    tlsInsecure: boolean;
    productName: string;
  };
  playwrightMcp: {
    headless: boolean;
  };
  sandbox: {
    dockerImage: string;
    timeoutMs: number;
  };
  targetBaseUrl: string;
  testUser?: {
    email: string;
    password: string;
  };
}

interface ResolvedBackend {
  backend: AppConfig['backend'];
  xray: AppConfig['xray'];
  kiwi?: AppConfig['kiwi'];
}

/**
 * Picks the test-management backend and its config, never running half-
 * authenticated: if the chosen backend's credentials are incomplete it falls
 * back to stub with a warning. TCMS_BACKEND wins; absent it, the legacy
 * XRAY_MODE mapping (live -> xray, stub -> stub) applies for backward compat.
 */
function resolveBackend(raw: RawEnv): ResolvedBackend {
  const xrayVars = {
    jiraBaseUrl: raw.JIRA_BASE_URL || undefined,
    jiraEmail: raw.JIRA_EMAIL || undefined,
    jiraApiToken: raw.JIRA_API_TOKEN || undefined,
    clientId: raw.XRAY_CLIENT_ID || undefined,
    clientSecret: raw.XRAY_CLIENT_SECRET || undefined,
    projectKey: raw.XRAY_PROJECT_KEY || undefined,
  };
  const hasAllXrayCreds = Object.values(xrayVars).every((v) => v !== undefined);
  const hasKiwiCreds = Boolean(raw.KIWI_BASE_URL && raw.KIWI_USERNAME && raw.KIWI_PASSWORD);

  let backend: AppConfig['backend'] = raw.TCMS_BACKEND || (raw.XRAY_MODE === 'live' ? 'xray' : 'stub');

  if (backend === 'xray' && !hasAllXrayCreds) {
    // eslint-disable-next-line no-console
    console.warn(
      '[config] backend=xray but one or more Jira/Xray credentials are missing. Forcing stub. ' +
        'Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, XRAY_CLIENT_ID, XRAY_CLIENT_SECRET, XRAY_PROJECT_KEY.',
    );
    backend = 'stub';
  }
  if (backend === 'kiwi' && !hasKiwiCreds) {
    // eslint-disable-next-line no-console
    console.warn('[config] backend=kiwi but KIWI_BASE_URL / KIWI_USERNAME / KIWI_PASSWORD are incomplete. Forcing stub.');
    backend = 'stub';
  }

  const kiwi =
    backend === 'kiwi'
      ? {
          baseUrl: raw.KIWI_BASE_URL!,
          username: raw.KIWI_USERNAME!,
          password: raw.KIWI_PASSWORD!,
          tlsInsecure: raw.KIWI_TLS_INSECURE,
          productName: raw.KIWI_PRODUCT || raw.XRAY_PROJECT_KEY || 'Sutra',
        }
      : undefined;

  return { backend, xray: { mode: backend === 'xray' ? 'live' : 'stub', ...xrayVars }, kiwi };
}

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  const parsed = rawSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill in required values.`);
  }

  const raw = parsed.data;
  if (!raw.ANTHROPIC_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn('[config] ANTHROPIC_API_KEY not set — relying on an existing OAuth session (e.g. Claude Code login) instead.');
  }
  const resolved = resolveBackend(raw);
  cached = {
    anthropicApiKey: raw.ANTHROPIC_API_KEY || undefined,
    claudeModel: raw.CLAUDE_MODEL,
    backend: resolved.backend,
    xray: resolved.xray,
    kiwi: resolved.kiwi,
    playwrightMcp: { headless: raw.PLAYWRIGHT_MCP_HEADLESS },
    sandbox: { dockerImage: raw.SANDBOX_DOCKER_IMAGE, timeoutMs: raw.SANDBOX_TIMEOUT_MS },
    targetBaseUrl: raw.TARGET_BASE_URL,
    testUser: raw.TEST_USER_EMAIL && raw.TEST_USER_PASSWORD ? { email: raw.TEST_USER_EMAIL, password: raw.TEST_USER_PASSWORD } : undefined,
  };
  return cached;
}

/** Test-only: clear the memoized config so tests can reload with different env vars. */
export function resetConfigCache(): void {
  cached = undefined;
}
