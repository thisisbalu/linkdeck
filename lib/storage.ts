import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { withLock } from "./lock";
import { backupIfDue } from "./backup";
import {
  dataDir,
  dataSource,
  defaultDataDir,
  describeLocation,
  projectRoot,
  writeConfig,
  assertStorageAvailable,
  StorageUnavailableError,
  type DataSource,
} from "./paths";
import { thisMachine, type MachineInfo } from "./machine";
import { findConflicts, type ConflictCopy } from "./conflicts";

/** Files that make up Linkdeck's data, besides the backups/ and favicons/ folders. */
const DATA_FILES = ["bookmarks.json", "category-rules.json", "link-status.json", "usage-sync.json"] as const;
const DATA_FOLDERS = ["backups", "favicons"] as const;
const PREVIOUS_RE = /^data\.previous-\d{8}-\d{6}$/;

export class StorageMoveError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "StorageMoveError";
  }
}

export type FolderSummary = {
  path: string;
  label: string;
  exists: boolean;
  bookmarks: number | null;
  rules: number | null;
  modifiedAt: string | null;
  bytes: number;
  error?: string;
};

export type Suggestion = { label: string; path: string; parentExists: boolean; hasData: boolean };

export type StorageStatus = {
  dataDir: string;
  defaultDir: string;
  label: string;
  source: DataSource;
  isDefault: boolean;
  available: boolean;
  error: string | null;
  machine: MachineInfo;
  summary: FolderSummary;
  conflicts: ConflictCopy[];
  suggestions: Suggestion[];
  previousCopies: FolderSummary[];
};

// ── Inspection ───────────────────────────────────────────────────────────────

function folderBytes(dir: string): number {
  let total = 0;
  const walk = (d: string, depth: number) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isFile()) { try { total += fs.statSync(full).size; } catch { /* ignore */ } }
      else if (e.isDirectory() && depth < 1) walk(full, depth + 1);
    }
  };
  for (const f of DATA_FILES) { try { total += fs.statSync(path.join(dir, f)).size; } catch { /* missing */ } }
  for (const d of DATA_FOLDERS) walk(path.join(dir, d), 0);
  return total;
}

function summarize(dir: string): FolderSummary {
  const summary: FolderSummary = {
    path: dir, label: describeLocation(dir), exists: false, bookmarks: null, rules: null, modifiedAt: null, bytes: 0,
  };
  try {
    summary.exists = fs.statSync(dir).isDirectory();
  } catch {
    return summary;
  }
  const bookmarksPath = path.join(dir, "bookmarks.json");
  try {
    const st = fs.statSync(bookmarksPath);
    summary.modifiedAt = st.mtime.toISOString();
    const data = JSON.parse(fs.readFileSync(bookmarksPath, "utf-8"));
    if (!Array.isArray(data)) throw new Error("not a list");
    summary.bookmarks = data.length;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") summary.error = "bookmarks.json can't be read";
  }
  try {
    const rules = JSON.parse(fs.readFileSync(path.join(dir, "category-rules.json"), "utf-8"));
    summary.rules = rules && typeof rules === "object" ? Object.keys(rules).length : null;
  } catch { /* none */ }
  summary.bytes = folderBytes(dir);
  return summary;
}

/** Cloud folders on this Mac that make good homes for Linkdeck's data. */
function cloudSuggestions(): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (base: string) => {
    const target = path.join(base, "Linkdeck");
    out.push({
      label: describeLocation(target),
      path: target,
      parentExists: fs.existsSync(base),
      hasData: fs.existsSync(path.join(target, "bookmarks.json")),
    });
  };
  const cloud = path.join(os.homedir(), "Library", "CloudStorage");
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(cloud, { withFileTypes: true }); } catch { /* none */ }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    // Skip archived copies macOS leaves behind, e.g. "iCloudDrive-iCloudDrive (2026-06-29 12:00 PM)".
    if (!e.isDirectory() || e.name.includes(" (")) continue;
    if (!/^(Box|OneDrive|Dropbox|GoogleDrive)/i.test(e.name)) continue;
    add(path.join(cloud, e.name));
  }
  const icloud = path.join(os.homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs");
  if (fs.existsSync(icloud)) add(icloud);
  return out.filter((s) => s.path !== dataDir());
}

function previousCopies(): FolderSummary[] {
  let names: string[] = [];
  try { names = fs.readdirSync(projectRoot()).filter((n) => PREVIOUS_RE.test(n)); } catch { /* none */ }
  return names.sort().reverse().map((n) => summarize(path.join(projectRoot(), n)));
}

export function storageStatus(): StorageStatus {
  const dir = dataDir();
  let available = true;
  let error: string | null = null;
  try {
    assertStorageAvailable();
  } catch (err) {
    if (!(err instanceof StorageUnavailableError)) throw err;
    available = false;
    error = err.message;
  }
  return {
    dataDir: dir,
    defaultDir: defaultDataDir(),
    label: describeLocation(dir),
    source: dataSource(),
    isDefault: dir === defaultDataDir(),
    available,
    error,
    machine: thisMachine(),
    summary: summarize(dir),
    conflicts: available ? findConflicts(dir) : [],
    suggestions: cloudSuggestions(),
    previousCopies: previousCopies(),
  };
}

// ── Validation ───────────────────────────────────────────────────────────────

const isInside = (child: string, parent: string) => child === parent || child.startsWith(parent + path.sep);

function resolveTarget(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) throw new StorageMoveError("Choose a folder");
  let p = input.trim();
  if (p.length > 1024) throw new StorageMoveError("That path is too long");
  if (p === "~") p = os.homedir();
  else if (p.startsWith("~/")) p = path.join(os.homedir(), p.slice(2));
  if (!path.isAbsolute(p)) throw new StorageMoveError("Enter a full path, e.g. ~/Library/CloudStorage/Box-Box/Linkdeck");
  return path.normalize(p).replace(/\/+$/, "") || "/";
}

function validateTarget(target: string): void {
  const home = os.homedir();
  const current = dataDir();
  const root = projectRoot();
  const blocked = ["/System", "/usr", "/bin", "/sbin", "/etc", "/Applications", "/Library", "/Volumes"];
  if (target === "/" || isInside(home, target) || blocked.some((b) => isInside(target, b)) || target === path.join(home, "Library")) {
    throw new StorageMoveError("Pick a folder of its own, e.g. a “Linkdeck” folder inside Box or OneDrive");
  }
  if (target === current) throw new StorageMoveError("Linkdeck is already using this folder");
  if (isInside(target, root)) {
    const allowed = target === defaultDataDir() || (path.dirname(target) === root && PREVIOUS_RE.test(path.basename(target)));
    if (!allowed) throw new StorageMoveError("That folder is inside the app — choose a folder outside it");
  }
  if (isInside(target, current) || isInside(current, target)) {
    throw new StorageMoveError("The new folder can't be inside the current one (or the other way round)");
  }
  let parent: fs.Stats;
  try { parent = fs.statSync(path.dirname(target)); } catch {
    throw new StorageMoveError(`${path.dirname(target)} doesn't exist`);
  }
  if (!parent.isDirectory()) throw new StorageMoveError(`${path.dirname(target)} isn't a folder`);
  if (fs.existsSync(target) && !fs.statSync(target).isDirectory()) throw new StorageMoveError("That path is a file, not a folder");
  if (unrelatedEntries(target).length > 0 && !fs.existsSync(path.join(target, "bookmarks.json"))) {
    throw new StorageMoveError(
      `${path.basename(target)} already has other files in it — choose an empty folder, or a new “Linkdeck” folder inside it`
    );
  }
}

/** Anything in the folder that isn't Linkdeck's own (or macOS/cloud housekeeping). */
function unrelatedEntries(dir: string): string[] {
  let names: string[] = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  const ours = new Set<string>([...DATA_FILES, ...DATA_FOLDERS]);
  return names.filter((n) => !n.startsWith(".") && !ours.has(n) && n !== "Icon\r" && !/^(bookmarks|category-rules).*\.json$/i.test(n));
}

function ensureWritable(target: string): void {
  try {
    fs.mkdirSync(target, { recursive: true });
    const probe = path.join(target, `.linkdeck-write-test-${process.pid}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
  } catch {
    throw new StorageMoveError(`Linkdeck can't write to ${target}`);
  }
}

// ── Copying ──────────────────────────────────────────────────────────────────

const sha256 = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

type CopyStats = { files: number; bytes: number };

/** Copies one file via a temp name + rename, then confirms the checksum matches. */
function copyVerified(src: string, dest: string, stats: CopyStats, { overwrite }: { overwrite: boolean }): void {
  if (fs.existsSync(dest)) {
    if (!overwrite) return;
    if (sha256(src) === sha256(dest)) return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.linkdeck-copy-${process.pid}`;
  fs.copyFileSync(src, tmp);
  if (sha256(src) !== sha256(tmp)) {
    fs.rmSync(tmp, { force: true });
    throw new StorageMoveError(`Copy check failed for ${path.basename(src)} — nothing was switched`, 500);
  }
  fs.renameSync(tmp, dest);
  stats.files++;
  stats.bytes += fs.statSync(dest).size;
}

function copyFolder(srcDir: string, destDir: string, stats: CopyStats): void {
  let names: string[] = [];
  try { names = fs.readdirSync(srcDir); } catch { return; }
  for (const name of names) {
    const src = path.join(srcDir, name);
    if (!fs.statSync(src).isFile() || name.startsWith(".")) continue;
    copyVerified(src, path.join(destDir, name), stats, { overwrite: false });
  }
}

function copyData(from: string, to: string, { replace }: { replace: boolean }): CopyStats {
  const stats: CopyStats = { files: 0, bytes: 0 };
  if (replace) {
    // Keep what was there as restorable backups before overwriting it.
    const targetBackups = path.join(to, "backups");
    backupIfDue(path.join(to, "bookmarks.json"), targetBackups, { intervalMs: 0 });
    backupIfDue(path.join(to, "category-rules.json"), targetBackups, { intervalMs: 0, prefix: "category-rules" });
  }
  for (const file of DATA_FILES) {
    const src = path.join(from, file);
    const dest = path.join(to, file);
    if (fs.existsSync(src)) copyVerified(src, dest, stats, { overwrite: true });
    else if (file === "bookmarks.json") fs.writeFileSync(dest, "[]\n");
    else if (replace) fs.rmSync(dest, { force: true });
  }
  copyFolder(path.join(from, "backups"), path.join(to, "backups"), stats);
  copyFolder(path.join(from, "favicons"), path.join(to, "favicons"), stats);
  return stats;
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Renames the project's data folder out of the way (never deleted). */
function retireDefaultFolder(from: string): string | null {
  if (from !== defaultDataDir() || !fs.existsSync(from)) return null;
  let dest = path.join(projectRoot(), `data.previous-${stamp()}`);
  for (let i = 1; fs.existsSync(dest); i++) dest = path.join(projectRoot(), `data.previous-${stamp()}-${i}`);
  try {
    fs.renameSync(from, dest);
    return dest;
  } catch {
    return null;
  }
}

function pointTo(target: string): void {
  writeConfig(target === defaultDataDir() ? null : target);
}

// ── Move / switch ────────────────────────────────────────────────────────────

/**
 *  auto          copy here; if the folder already has Linkdeck data, ask (needsChoice)
 *  replace       copy here, replacing data that's already there (kept as backups first)
 *  use-existing  don't copy — start using the data already in the folder
 */
export type MoveMode = "auto" | "replace" | "use-existing";

export type MoveResult =
  | { needsChoice: true; target: string; existing: FolderSummary; current: FolderSummary }
  | {
      needsChoice: false;
      from: string;
      to: string;
      label: string;
      mode: "copied" | "replaced" | "switched";
      copied: CopyStats;
      previous: string | null;
    };

export async function moveData(targetInput: unknown, mode: MoveMode = "auto"): Promise<MoveResult> {
  if (dataSource() === "env") {
    throw new StorageMoveError("The data folder is set by LINKDECK_DATA_DIR, so it can't be changed here", 409);
  }
  if (!["auto", "replace", "use-existing"].includes(mode)) throw new StorageMoveError("Unknown mode");
  const target = resolveTarget(targetInput);
  validateTarget(target);

  const from = dataDir();
  const existing = summarize(target);
  const targetHasData = existing.bookmarks !== null;
  if (existing.error) {
    throw new StorageMoveError(`That folder has a bookmarks.json Linkdeck can't read — fix or remove it first`);
  }

  if (mode === "use-existing") {
    if (!targetHasData) throw new StorageMoveError("That folder has no Linkdeck data to use");
    pointTo(target);
    const previous = retireDefaultFolder(from);
    return { needsChoice: false, from, to: target, label: describeLocation(target), mode: "switched", copied: { files: 0, bytes: 0 }, previous };
  }

  if (targetHasData && mode === "auto") {
    return { needsChoice: true, target, existing, current: summarize(from) };
  }

  ensureWritable(target);
  // Hold every data lock so nothing changes mid-copy; other requests wait and
  // then continue against the new folder.
  const copied = await withLock("bookmarks", () =>
    withLock("category-rules", () =>
      withLock("link-status", async () => {
        const stats = copyData(from, target, { replace: targetHasData });
        pointTo(target);
        return stats;
      })
    )
  );
  const previous = retireDefaultFolder(from);
  return {
    needsChoice: false,
    from,
    to: target,
    label: describeLocation(target),
    mode: targetHasData ? "replaced" : "copied",
    copied,
    previous,
  };
}
