import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

/**
 * Where Linkdeck keeps its data, resolved in this order:
 *   1. LINKDECK_DATA_DIR  — environment override (tests, development)
 *   2. linkdeck.config.json in the project → { "dataDir": "/absolute/path" }
 *      (set from the app: ⋯ → Storage location…, or `npm run data:move`)
 *   3. <project>/data     — the default
 *
 * The config file is re-checked on every call (cheap stat), so a move made by
 * one process takes effect immediately in all of them, with no restart.
 */

export type DataSource = "env" | "config" | "default";

/** Project folder. LINKDECK_ROOT exists only so tests can use a scratch project. */
export function projectRoot(): string {
  const override = process.env.LINKDECK_ROOT?.trim();
  return override ? path.resolve(override) : process.cwd();
}

const configFile = () => path.join(projectRoot(), "linkdeck.config.json");
export const defaultDataDir = () => path.join(projectRoot(), "data");
/** Machine-local state that must never sync between Macs (locks, machine id). */
export const localStateDir = () => path.join(projectRoot(), ".linkdeck");

type LinkdeckConfig = { dataDir?: string };

type Cached = { key: string; config: LinkdeckConfig };
let cached: Cached | null = null;

export function readConfig(): LinkdeckConfig {
  let st: fs.Stats;
  try {
    st = fs.statSync(configFile());
  } catch {
    cached = null;
    return {};
  }
  const key = `${configFile()}:${st.ino}:${st.mtimeMs}:${st.size}`;
  if (cached?.key === key) return cached.config;
  let config: LinkdeckConfig = {};
  try {
    const raw = JSON.parse(fs.readFileSync(configFile(), "utf-8"));
    if (raw && typeof raw === "object" && typeof raw.dataDir === "string" && path.isAbsolute(raw.dataDir)) {
      config = { dataDir: path.normalize(raw.dataDir) };
    }
  } catch {
    // Unreadable config: fall back to defaults rather than crash.
  }
  cached = { key, config };
  return config;
}

/** Writes the config atomically; `dataDir: null` returns to the default. */
export function writeConfig(dataDir: string | null): void {
  const file = configFile();
  if (dataDir === null) {
    try { fs.unlinkSync(file); } catch { /* already default */ }
    cached = null;
    return;
  }
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ dataDir }, null, 2) + "\n");
  fs.renameSync(tmp, file);
  cached = null;
}

export function dataSource(): DataSource {
  if (process.env.LINKDECK_DATA_DIR?.trim()) return "env";
  return readConfig().dataDir ? "config" : "default";
}

export function dataDir(): string {
  const env = process.env.LINKDECK_DATA_DIR?.trim();
  if (env) return path.resolve(projectRoot(), env);
  return readConfig().dataDir ?? defaultDataDir();
}

export const bookmarksFile = () => path.join(dataDir(), "bookmarks.json");
export const backupsDir = () => path.join(dataDir(), "backups");
export const categoryRulesFile = () => path.join(dataDir(), "category-rules.json");
export const linkStatusFile = () => path.join(dataDir(), "link-status.json");
export const usageSyncFile = () => path.join(dataDir(), "usage-sync.json");
export const faviconsDir = () => path.join(dataDir(), "favicons");

/**
 * Lock files stay on this Mac even when the data lives in a synced folder —
 * a lock can't coordinate two Macs through a sync service, and synced lock
 * files would only cause confusion. One lock folder per data location.
 */
export function lockDir(): string {
  const override = process.env.LINKDECK_LOCK_DIR?.trim();
  if (override) return path.resolve(override);
  const hash = crypto.createHash("sha1").update(dataDir()).digest("hex").slice(0, 12);
  return path.join(localStateDir(), "locks", hash);
}

export class StorageUnavailableError extends Error {
  constructor(message: string, public readonly dir: string) {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

/** Friendly name for well-known cloud folders. */
export function describeLocation(dir: string): string {
  const cloud = path.join(os.homedir(), "Library", "CloudStorage") + path.sep;
  if (dir.startsWith(cloud)) {
    const provider = dir.slice(cloud.length).split(path.sep)[0];
    const [name, account] = provider.split(/-(.+)/);
    const pretty = ({ GoogleDrive: "Google Drive" } as Record<string, string>)[name] ?? name;
    return account && account !== name ? `${pretty} (${account})` : pretty;
  }
  if (dir.includes(`${path.sep}Mobile Documents${path.sep}com~apple~CloudDocs`)) return "iCloud Drive";
  if (dir === defaultDataDir()) return "Project folder";
  return "Custom folder";
}

/**
 * For a folder chosen in Storage settings (not the default or an env
 * override), refuse to treat a missing folder or missing bookmarks.json as
 * "no bookmarks": a cloud drive that isn't mounted or hasn't finished
 * downloading would otherwise look empty, and the next save would overwrite
 * the real data when sync catches up.
 */
export function assertStorageAvailable(): void {
  if (dataSource() !== "config") return;
  const dir = dataDir();
  const where = describeLocation(dir);
  let st: fs.Stats;
  try {
    st = fs.statSync(dir);
  } catch {
    throw new StorageUnavailableError(
      `Your Linkdeck folder isn't available: ${dir}. ${where !== "Custom folder" ? `Is ${where} running and signed in? ` : ""}Linkdeck won't make changes until it's back.`,
      dir
    );
  }
  if (!st.isDirectory()) {
    throw new StorageUnavailableError(`Your Linkdeck folder path is not a folder: ${dir}`, dir);
  }
  if (!fs.existsSync(path.join(dir, "bookmarks.json"))) {
    throw new StorageUnavailableError(
      `bookmarks.json is missing from your Linkdeck folder (${dir}). If it syncs from the cloud it may still be downloading — Linkdeck won't make changes until it appears.`,
      dir
    );
  }
}
