import fs from "fs";
import path from "path";
import { backupIfDue } from "./backup";
import { transformAllBookmarks, withChromeTotals } from "./bookmarks";
import { transformCategoryRules, type CategoryRules } from "./category-rules";
import { backupsDir, dataDir } from "./paths";
import { validateBookmarks, validateRules } from "./restore";
import { normalizeUrl } from "./url";
import type { Bookmark, ChromeMachineUsage } from "./types";

/**
 * Cloud drives keep both versions when the same file changes on two Macs at
 * once, under names like "bookmarks (1).json", "bookmarks 2.json",
 * "bookmarks-MacBook-Pro.json" or "bookmarks (Balu's conflicted copy).json".
 * Any such sibling of bookmarks.json / category-rules.json is reported here.
 */

export type ConflictKind = "bookmarks" | "category-rules";
export type ConflictAction = "merge" | "keep-mine" | "keep-theirs";

export type ConflictCopy = {
  file: string;
  kind: ConflictKind;
  count: number | null;
  modifiedAt: string;
  valid: boolean;
  /** For bookmarks: how many bookmarks a merge would add. */
  wouldAdd?: number;
};

const PATTERNS: [ConflictKind, RegExp, string][] = [
  ["bookmarks", /^bookmarks.+\.json$/i, "bookmarks.json"],
  ["category-rules", /^category-rules.+\.json$/i, "category-rules.json"],
];

function kindOf(name: string): ConflictKind | null {
  for (const [kind, re, canonical] of PATTERNS) if (name !== canonical && re.test(name)) return kind;
  return null;
}

function readJsonFile(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export function findConflicts(dir = dataDir()): ConflictCopy[] {
  let names: string[] = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out: ConflictCopy[] = [];
  let mine: Bookmark[] | null = null;
  for (const name of names.sort()) {
    const kind = kindOf(name);
    if (!kind) continue;
    const file = path.join(dir, name);
    let st: fs.Stats;
    try { st = fs.statSync(file); } catch { continue; }
    if (!st.isFile()) continue;
    const entry: ConflictCopy = { file: name, kind, count: null, modifiedAt: st.mtime.toISOString(), valid: false };
    try {
      const data = readJsonFile(file);
      if (kind === "bookmarks") {
        const v = validateBookmarks(data);
        if (v.ok) {
          entry.valid = true;
          entry.count = v.value.length;
          if (mine === null) {
            try {
              const current = validateBookmarks(readJsonFile(path.join(dir, "bookmarks.json")));
              mine = current.ok ? current.value : [];
            } catch {
              mine = [];
            }
          }
          entry.wouldAdd = mergeBookmarks(mine, v.value).length - mine.length;
        }
      } else {
        const v = validateRules(data);
        if (v.ok) { entry.valid = true; entry.count = Object.keys(v.value).length; }
      }
    } catch { /* unreadable — reported as invalid */ }
    out.push(entry);
  }
  return out;
}

function laterUsage(a: ChromeMachineUsage | undefined, b: ChromeMachineUsage): ChromeMachineUsage {
  if (!a) return b;
  return (b.lastVisitAt ?? "") > (a.lastVisitAt ?? "") ? b : a;
}

/**
 * Keeps every bookmark from both versions. For bookmarks in both, this Mac's
 * version wins, but usage counts are combined (each Mac's newest Chrome
 * counts, the higher portal count). A bookmark only in theirs is added unless
 * mine already has the same URL.
 */
export function mergeBookmarks(mine: Bookmark[], theirs: Bookmark[]): Bookmark[] {
  const theirsById = new Map(theirs.map((b) => [b.id, b]));
  const mineIds = new Set(mine.map((b) => b.id));
  const urls = new Set(mine.map((b) => normalizeUrl(b.url)));
  const merged = mine.map((b) => {
    const t = theirsById.get(b.id);
    if (!t) return b;
    let next: Bookmark = { ...b };
    const visits = Math.max(b.visitCount ?? 0, t.visitCount ?? 0);
    if (visits) next.visitCount = visits;
    const last = [b.lastVisitedAt, t.lastVisitedAt].filter((d): d is string => !!d).sort().at(-1);
    if (last) next.lastVisitedAt = last;
    if (b.chromeUsage || t.chromeUsage) {
      const usage: Record<string, ChromeMachineUsage> = { ...(b.chromeUsage ?? {}) };
      for (const [id, u] of Object.entries(t.chromeUsage ?? {})) usage[id] = laterUsage(usage[id], u);
      next = withChromeTotals(next, usage);
    }
    return next;
  });
  for (const t of theirs) {
    if (mineIds.has(t.id) || urls.has(normalizeUrl(t.url))) continue;
    urls.add(normalizeUrl(t.url));
    merged.push(t);
  }
  return merged;
}

export class ConflictError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Resolves one conflict copy. Whatever is chosen, the conflict copy is kept
 * as a normal backup (restorable from ⋯ → Restore from backup) and removed
 * from the data folder; replacing the current data takes a safety backup.
 */
export async function resolveConflict(fileName: unknown, action: unknown): Promise<{ kind: ConflictKind; count: number }> {
  if (action !== "merge" && action !== "keep-mine" && action !== "keep-theirs") throw new ConflictError("Unknown action");
  const conflict = findConflicts().find((c) => c.file === fileName);
  if (!conflict) throw new ConflictError("That conflict copy no longer exists", 404);
  if (!conflict.valid && action !== "keep-mine") throw new ConflictError("That copy can't be read — only “Keep mine” is possible");

  const file = path.join(dataDir(), conflict.file);
  let count: number;
  if (conflict.kind === "bookmarks") {
    const theirs = conflict.valid ? (validateBookmarks(readJsonFile(file)) as { ok: true; value: Bookmark[] }).value : [];
    if (action === "keep-mine") {
      count = conflict.count ?? 0;
    } else {
      const result = await transformAllBookmarks((mine) => (action === "merge" ? mergeBookmarks(mine, theirs) : theirs));
      count = result.length;
    }
    backupIfDue(file, backupsDir(), { intervalMs: 0 });
  } else {
    const theirs = conflict.valid ? (validateRules(readJsonFile(file)) as { ok: true; value: CategoryRules }).value : {};
    if (action === "keep-mine") {
      count = conflict.count ?? 0;
    } else {
      const result = await transformCategoryRules((mine) => (action === "merge" ? { ...theirs, ...mine } : theirs));
      count = Object.keys(result).length;
    }
    backupIfDue(file, backupsDir(), { intervalMs: 0, prefix: "category-rules" });
  }
  fs.rmSync(file, { force: true });
  return { kind: conflict.kind, count };
}
