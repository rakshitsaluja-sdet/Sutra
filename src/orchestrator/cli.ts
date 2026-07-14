#!/usr/bin/env node
import { Command } from 'commander';
import type { InputType } from '../stages/01-requirement-analyst/detectInputType.js';
import { logger } from '../utils/logger.js';
import { runPipeline } from './pipeline.js';

const program = new Command();

program
  .name('pipeline')
  .description('BRD/user-story to Xray-verified Playwright automation pipeline')
  .requiredOption('--brd <path>', 'Path to the input file (a BRD, or an already-written user story) — .md/.txt/.docx')
  .option('--type <type>', 'Force input classification instead of auto-detecting: auto | brd | user-story', 'auto')
  .action(async (opts: { brd: string; type: string }) => {
    if (opts.type !== 'auto' && opts.type !== 'brd' && opts.type !== 'user-story') {
      logger.error(`Invalid --type "${opts.type}". Must be one of: auto, brd, user-story`);
      process.exitCode = 1;
      return;
    }
    await runPipeline({ inputPath: opts.brd, inputType: opts.type as InputType | 'auto' });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  logger.error({ err }, 'Pipeline failed');
  process.exitCode = 1;
});
