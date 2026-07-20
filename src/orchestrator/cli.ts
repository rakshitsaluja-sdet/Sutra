#!/usr/bin/env node
import { Command } from 'commander';
import type { InputType } from '../stages/01-requirement-analyst/detectInputType.js';
import { jiraSourceId, type JiraSource } from '../stages/01-requirement-analyst/jiraInputSource.js';
import { logger } from '../utils/logger.js';
import { runPipeline } from './pipeline.js';

const program = new Command();

program
  .name('pipeline')
  .description('BRD/user-story to Xray/Kiwi-verified Playwright automation pipeline')
  .option('--brd <path>', 'Read requirements from a local file (a BRD or user story) — .md/.txt/.docx')
  .option('--jira-epic <key>', 'Read requirements from a Jira Epic: its child stories, or a BRD on the epic (attachment/description)')
  .option('--jira-issue <key>', 'Read requirements from a single Jira issue (its BRD attachment or description)')
  .option('--type <type>', 'Force input classification instead of auto-detecting: auto | brd | user-story', 'auto')
  .option(
    '--exclude-keyword <words>',
    'Comma-separated, case-insensitive keywords — test cases whose title contains any of them are never auto-selected as the one automated this run (e.g. "register,signup" to guarantee a run never exercises account creation)',
    '',
  )
  .action(async (opts: { brd?: string; jiraEpic?: string; jiraIssue?: string; type: string; excludeKeyword: string }) => {
    const sources = [opts.brd, opts.jiraEpic, opts.jiraIssue].filter(Boolean);
    if (sources.length !== 1) {
      logger.error('Provide exactly one input source: --brd <path>, --jira-epic <key>, or --jira-issue <key>.');
      process.exitCode = 1;
      return;
    }
    if (opts.type !== 'auto' && opts.type !== 'brd' && opts.type !== 'user-story') {
      logger.error(`Invalid --type "${opts.type}". Must be one of: auto, brd, user-story`);
      process.exitCode = 1;
      return;
    }
    const excludeKeywords = opts.excludeKeyword
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    const inputType = opts.type as InputType | 'auto';

    const jiraSource: JiraSource | undefined = opts.jiraEpic
      ? { epicKey: opts.jiraEpic }
      : opts.jiraIssue
        ? { issueKey: opts.jiraIssue }
        : undefined;

    await runPipeline({
      inputPath: jiraSource ? jiraSourceId(jiraSource) : opts.brd!,
      inputType,
      jiraSource,
      excludeKeywords,
    });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  logger.error({ err }, 'Pipeline failed');
  process.exitCode = 1;
});
