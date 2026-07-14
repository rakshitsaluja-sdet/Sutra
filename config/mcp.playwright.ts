import type { AppConfig } from './env.js';

/**
 * MCP server spec for the Agent SDK's `mcpServers` option. Used only by stages
 * that need to ground themselves in the real target app (Script Generator,
 * Self-Healer) — never by the Sandbox Runner, which executes the generated
 * suite deterministically via the plain Playwright Test runner.
 *
 * A fresh instance is built per stage invocation (see sdk/client.ts) so one
 * test case's browser session never leaks into another's.
 */
export function buildPlaywrightMcpConfig(config: AppConfig) {
  const args = ['-y', '@playwright/mcp@latest', '--isolated'];
  if (config.playwrightMcp.headless) {
    args.push('--headless');
  }

  return {
    playwright: {
      type: 'stdio' as const,
      command: 'npx',
      args,
    },
  };
}
