import fs from "fs";
import path from "path";

const BACKUP_INTERVAL_MS = 60 * 60 * 1000; // at most one snapshot per hour
const BACKUPS_TO_KEEP = 48;

const STAMP_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/;

/** `<prefix>-<ISO timestamp>.json`, e.g. bookmarks-2026-10-27T17-12-24-180Z.json */
export function backupFileName(date: Date, prefix = "bookmarks"): string {
  return `${prefix}-${date.toISOString().replace(/[:.]/g, "-")}.json`;
}

function timestampOf(name: string, prefix: string): number | null {
  if (!name.startsWith(`${prefix}-`)) return null;
  const m = STAMP_RE.exec(name.slice(prefix.length + 1));
  if (!m) return null;
  return Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
}

export const BACKUP_KINDS = ["bookmarks", "category-rules"] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];

/** Parses a backup file name; null for anything that isn't one (guards against path tricks). */
export function parseBackupName(name: string): { kind: BackupKind; createdAt: Date } | null {
  for (const kind of BACKUP_KINDS) {
    const ts = timestampOf(name, kind);
    // "bookmarks-" must not match "category-rules-…" and vice versa; timestampOf checks the prefix.
    if (ts !== null) return { kind, createdAt: new Date(ts) };
  }
  return null;
}

/** Backup file names for `prefix`, newest first. */
export function listBackups(backupDir: string, prefix = "bookmarks"): string[] {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((n) => timestampOf(n, prefix) !== null)
    .sort((a, b) => timestampOf(b, prefix)! - timestampOf(a, prefix)!);
}

/**
 * Snapshots `sourceFile` into `backupDir` if the newest snapshot with the same
 * `prefix` is older than `intervalMs`, then prunes so only the newest `keep`
 * snapshots with that prefix remain.
 * Called right before every write, so each snapshot is a known-good state.
 * Returns the created snapshot path, or null if none was needed.
 */
export function backupIfDue(
  sourceFile: string,
  backupDir: string,
  { now = new Date(), intervalMs = BACKUP_INTERVAL_MS, keep = BACKUPS_TO_KEEP, prefix = "bookmarks" } = {}
): string | null {
  if (!fs.existsSync(sourceFile)) return null;

  const existing = listBackups(backupDir, prefix);
  const newest = existing[0] ? timestampOf(existing[0], prefix)! : null;
  if (newest !== null && now.getTime() - newest < intervalMs) return null;

  fs.mkdirSync(backupDir, { recursive: true });
  // Never overwrite an existing snapshot taken in the same millisecond.
  let stamp = now.getTime();
  while (fs.existsSync(path.join(backupDir, backupFileName(new Date(stamp), prefix)))) stamp++;
  const target = path.join(backupDir, backupFileName(new Date(stamp), prefix));
  fs.copyFileSync(sourceFile, target);

  for (const old of [path.basename(target), ...existing].slice(keep)) {
    try { fs.unlinkSync(path.join(backupDir, old)); } catch { /* ignore */ }
  }
  return target;
}
