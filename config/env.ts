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
});

type RawEnv = z.infer<typeof rawSchema>;

export interface AppConfig {
  /** Unset when relying on an existing OAuth session instead of a metered API key. */
  anthropicApiKey?: string;
  claudeModel: string;
  xray: {
    mode: 'stub' | 'live';
    jiraBaseUrl?: string;
    jiraEmail?: string;
    jiraApiToken?: string;
    clientId?: string;
    clientSecret?: string;
    projectKey?: string;
  };
  playwrightMcp: {
    headless: boolean;
  };
  sandbox: {
    dockerImage: string;
    timeoutMs: number;
  };
  targetBaseUrl: string;
}

function buildXrayConfig(raw: RawEnv): AppConfig['xray'] {
  const xrayVars = {
    jiraBaseUrl: raw.JIRA_BASE_URL || undefined,
    jiraEmail: raw.JIRA_EMAIL || undefined,
    jiraApiToken: raw.JIRA_API_TOKEN || undefined,
    clientId: raw.XRAY_CLIENT_ID || undefined,
    clientSecret: raw.XRAY_CLIENT_SECRET || undefined,
    projectKey: raw.XRAY_PROJECT_KEY || undefined,
  };

  const hasAllCreds = Object.values(xrayVars).every((v) => v !== undefined);

  if (raw.XRAY_MODE === 'live' && !hasAllCreds) {
    // eslint-disable-next-line no-console
    console.warn(
      '[config] XRAY_MODE=live was requested but one or more Jira/Xray credentials are ' +
        'missing. Forcing XRAY_MODE=stub — the pipeline never runs half-authenticated. ' +
        'Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, XRAY_CLIENT_ID, XRAY_CLIENT_SECRET, ' +
        'and XRAY_PROJECT_KEY to enable live mode.',
    );
    return { mode: 'stub', ...xrayVars };
  }

  return { mode: raw.XRAY_MODE, ...xrayVars };
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
  cached = {
    anthropicApiKey: raw.ANTHROPIC_API_KEY || undefined,
    claudeModel: raw.CLAUDE_MODEL,
    xray: buildXrayConfig(raw),
    playwrightMcp: { headless: raw.PLAYWRIGHT_MCP_HEADLESS },
    sandbox: { dockerImage: raw.SANDBOX_DOCKER_IMAGE, timeoutMs: raw.SANDBOX_TIMEOUT_MS },
    targetBaseUrl: raw.TARGET_BASE_URL,
  };
  return cached;
}

/** Test-only: clear the memoized config so tests can reload with different env vars. */
export function resetConfigCache(): void {
  cached = undefined;
}
