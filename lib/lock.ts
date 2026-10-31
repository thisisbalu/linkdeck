import fs from "fs";
import path from "path";
import { assertStorageAvailable, lockDir } from "./paths";

/**
 * Serializes read-modify-write operations on a data file.
 *
 * Two layers:
 *  1. An in-process queue per key, so requests inside one server never race.
 *  2. A lock file (`.<key>.lock`, created atomically with O_EXCL) in a
 *     machine-local folder (see lockDir in paths.ts) so separate processes
 *     sharing the data — the background service, `npm run dev`, scripts —
 *     never race either.
 *
 * A lock file left behind by a crashed process is treated as stale once its
 * owner PID is gone or it is older than STALE_MS.
 */

const STALE_MS = 15_000;
const ACQUIRE_TIMEOUT_MS = 20_000;
const RETRY_MS = 15;

const QUEUES_KEY = "__linkdeckLocks";
type Holder = { [QUEUES_KEY]?: Map<string, Promise<unknown>> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function isStale(content: string, mtimeMs: number): boolean {
  if (Date.now() - mtimeMs > STALE_MS) return true;
  const pid = Number.parseInt(content.split(":")[0], 10);
  return Number.isFinite(pid) && pid > 0 && !pidAlive(pid);
}

export function lockFilePath(key: string): string {
  return path.join(lockDir(), `.${key}.lock`);
}

async function acquireFileLock(file: string): Promise<() => void> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;

  for (;;) {
    try {
      fs.writeFileSync(file, token, { flag: "wx" });
      return () => {
        try {
          if (fs.readFileSync(file, "utf-8") === token) fs.unlinkSync(file);
        } catch { /* already gone */ }
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }

    try {
      const content = fs.readFileSync(file, "utf-8");
      const { mtimeMs } = fs.statSync(file);
      // Re-check the content right before removing so we never delete a lock
      // that another process has just taken over.
      if (isStale(content, mtimeMs) && fs.readFileSync(file, "utf-8") === content) {
        fs.unlinkSync(file);
        continue;
      }
    } catch { /* released between our checks — retry */ }

    if (Date.now() > deadline) throw new Error(`Timed out waiting for lock ${path.basename(file)}`);
    await sleep(RETRY_MS);
  }
}

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const holder = globalThis as Holder;
  const queues = (holder[QUEUES_KEY] ??= new Map());
  const previous = queues.get(key) ?? Promise.resolve();

  const run = previous.then(async () => {
    // Never write into a chosen storage folder that's currently unavailable.
    assertStorageAvailable();
    const release = await acquireFileLock(lockFilePath(key));
    try {
      return await fn();
    } finally {
      release();
    }
  });
  queues.set(key, run.catch(() => undefined));
  return run;
}
