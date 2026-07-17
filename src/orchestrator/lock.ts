import { open, readFile, unlink } from 'node:fs/promises';
import { logger } from '../utils/logger.js';

// Under generated/ (gitignored) — a machine-local runtime artifact, never shared.
const LOCK_PATH = 'generated/.pipeline.lock';

interface LockInfo {
  pid: number;
  inputPath: string;
  acquiredAt: string;
}

/** process.kill(pid, 0) probes liveness without signalling: ESRCH = dead, EPERM = alive-but-not-ours. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Prevents two pipeline runs from clobbering the same shared state
 * (clause-cache.json / xray-registry.json / generated/lineage/graph.json).
 * Uses an atomic exclusive-create lock file (O_EXCL). A lock left behind by a
 * crashed run is detected as stale (its pid is no longer alive) and reclaimed,
 * so a crash never wedges the pipeline permanently. Returns a release function.
 */
export async function acquirePipelineLock(inputPath: string): Promise<() => Promise<void>> {
  const info: LockInfo = { pid: process.pid, inputPath, acquiredAt: new Date().toISOString() };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(LOCK_PATH, 'wx'); // wx = O_CREAT | O_EXCL: fails if it already exists
      await handle.writeFile(JSON.stringify(info, null, 2));
      await handle.close();
      logger.info({ lockPath: LOCK_PATH, pid: info.pid }, '[lock] pipeline lock acquired');
      return async () => {
        await unlink(LOCK_PATH).catch(() => {});
        logger.info('[lock] pipeline lock released');
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;

      const holder = (await readFile(LOCK_PATH, 'utf-8')
        .then((raw) => JSON.parse(raw) as LockInfo)
        .catch(() => undefined)) as LockInfo | undefined;

      if (holder && holder.pid !== process.pid && isProcessAlive(holder.pid)) {
        throw new Error(
          `Another pipeline run is already in progress (pid ${holder.pid}, input "${holder.inputPath}", ` +
            `since ${holder.acquiredAt}). Refusing to run concurrently — it would clobber shared state ` +
            `(clause-cache.json / xray-registry.json / generated/lineage/graph.json). Wait for it to finish, ` +
            `or delete ${LOCK_PATH} if you are certain that run is dead.`,
        );
      }

      logger.warn({ stalePid: holder?.pid }, '[lock] found a stale lock from a dead process — reclaiming it');
      await unlink(LOCK_PATH).catch(() => {});
    }
  }

  throw new Error(`[lock] could not acquire ${LOCK_PATH} after reclaiming a stale lock — try again`);
}
