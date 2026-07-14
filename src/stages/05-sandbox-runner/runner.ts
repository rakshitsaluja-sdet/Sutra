import { execa } from 'execa';
import { resolve } from 'node:path';
import type { AppConfig } from '../../../config/env.js';
import { writeFileEnsuringDir } from '../../utils/fsSafe.js';
import { logger } from '../../utils/logger.js';
import { PLAYWRIGHT_CONFIG_CONTENT } from './playwrightConfigTemplate.js';

const SANDBOX_IMAGE_TAG = 'qa-pipeline-sandbox:local';

export interface SandboxRunResult {
  passed: boolean;
  exitCode: number;
  resultsJsonPath: string;
  htmlReportPath: string;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

async function ensureGeneratedConfig(): Promise<void> {
  await writeFileEnsuringDir('generated/playwright.config.ts', PLAYWRIGHT_CONFIG_CONTENT);
}

async function ensureSandboxImage(config: AppConfig): Promise<void> {
  const inspect = await execa('docker', ['image', 'inspect', SANDBOX_IMAGE_TAG], { reject: false });
  if (inspect.exitCode === 0) return;

  logger.info({ image: SANDBOX_IMAGE_TAG }, '[sandbox-runner] building sandbox image (first run only, cached after)');
  const build = await execa(
    'docker',
    [
      'build',
      '--build-arg',
      `PLAYWRIGHT_IMAGE=${config.sandbox.dockerImage}`,
      '-t',
      SANDBOX_IMAGE_TAG,
      '-f',
      'docker/sandbox.Dockerfile',
      '.',
    ],
    { reject: false },
  );
  if (build.exitCode !== 0) {
    throw new Error(`[sandbox-runner] failed to build sandbox image:\n${build.stderr}`);
  }
}

/**
 * Runs the generated suite inside a Docker container, isolated from the
 * host and from the shared suite — never executes LLM-generated code
 * directly on the host. Only generated/ and test-results/ are mounted in;
 * the sandbox image carries its own pre-installed, Linux-native
 * @playwright/test + playwright-bdd so the host's node_modules (built on
 * Windows) is never mounted into the Linux container.
 */
export async function runSandbox(config: AppConfig): Promise<SandboxRunResult> {
  await ensureGeneratedConfig();
  await ensureSandboxImage(config);

  const projectRoot = process.cwd();
  const generatedMount = resolve(projectRoot, 'generated');
  const resultsMount = resolve(projectRoot, 'test-results');

  logger.info({ image: SANDBOX_IMAGE_TAG, target: config.targetBaseUrl }, '[sandbox-runner] starting sandboxed run');

  const result = await execa(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${generatedMount}:/work/generated`,
      '-v',
      `${resultsMount}:/work/test-results`,
      '-e',
      `TARGET_BASE_URL=${config.targetBaseUrl}`,
      SANDBOX_IMAGE_TAG,
    ],
    { timeout: config.sandbox.timeoutMs, reject: false },
  );

  const timedOut = Boolean((result as { timedOut?: boolean }).timedOut);
  const exitCode = result.exitCode ?? 1;

  logger.info({ exitCode, timedOut, passed: exitCode === 0 }, '[sandbox-runner] run complete');

  return {
    passed: exitCode === 0 && !timedOut,
    exitCode,
    resultsJsonPath: resolve(projectRoot, 'test-results/results.json'),
    htmlReportPath: resolve(projectRoot, 'test-results/html-report'),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut,
  };
}
