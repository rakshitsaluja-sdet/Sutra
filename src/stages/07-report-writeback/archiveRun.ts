import { ZipArchive } from 'archiver';
import { createWriteStream } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../../utils/logger.js';

const ARCHIVE_ROOT = 'test-results/runs';

export interface ArchiveResult {
  archiveDir: string;
  zipPath: string;
}

/**
 * Copies the current test-results/ output (html-report, allure-report,
 * results.json, summary.md) into a dated, never-overwritten folder, then
 * zips it. The top-level test-results/* stays as the "latest run" view;
 * this is the permanent historical record referenced from Xray evidence.
 */
export async function archiveRun(runId: string): Promise<ArchiveResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveDir = join(ARCHIVE_ROOT, `${timestamp}_${runId}`);
  await mkdir(archiveDir, { recursive: true });

  const itemsToArchive = ['html-report', 'allure-report', 'results.json', 'summary.md'];
  for (const item of itemsToArchive) {
    try {
      await cp(join('test-results', item), join(archiveDir, item), { recursive: true });
    } catch {
      // Item may be missing (e.g. allure-report if generation failed upstream) — skip, don't fail the archive.
      logger.warn({ item }, '[report-writeback] archive item missing, skipped');
    }
  }

  const zipPath = `${archiveDir}.zip`;
  await zipDirectory(archiveDir, zipPath);

  logger.info({ archiveDir, zipPath }, '[report-writeback] run archived');
  return { archiveDir, zipPath };
}

function zipDirectory(sourceDir: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on('close', () => resolve());
    archive.on('error', (err: Error) => reject(err));
    archive.pipe(output);
    archive.directory(sourceDir, false);
    void archive.finalize();
  });
}
