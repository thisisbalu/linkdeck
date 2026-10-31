import { isHttpUrl } from "./url";
import type { Bookmark } from "./types";
import type { CategoryRules } from "./category-rules";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/**
 * Validates a list of bookmarks from a backup or exported file. Fills in
 * harmless defaults (description, tags, favicon, pinned) for older files and
 * keeps only known fields.
 */
export function validateBookmarks(data: unknown): Result<Bookmark[]> {
  if (!Array.isArray(data)) return { ok: false, error: "Expected a list of bookmarks" };
  const seen = new Set<string>();
  const out: Bookmark[] = [];
  for (let i = 0; i < data.length; i++) {
    const raw = data[i];
    const where = `Bookmark #${i + 1}`;
    if (!isObj(raw)) return { ok: false, error: `${where} is not an object` };
    if (!isStr(raw.id) || !raw.id) return { ok: false, error: `${where} has no id` };
    if (seen.has(raw.id)) return { ok: false, error: `${where} repeats id ${raw.id}` };
    seen.add(raw.id);
    if (!isStr(raw.url) || !isHttpUrl(raw.url)) return { ok: false, error: `${where} has an invalid URL` };
    if (!isStr(raw.title)) return { ok: false, error: `${where} has no title` };
    if (!isStr(raw.category) || !raw.category.trim()) return { ok: false, error: `${where} has no category` };
    if (!isStr(raw.addedAt) || Number.isNaN(Date.parse(raw.addedAt))) return { ok: false, error: `${where} has an invalid date` };
    if (raw.tags !== undefined && (!Array.isArray(raw.tags) || !raw.tags.every(isStr))) {
      return { ok: false, error: `${where} has invalid tags` };
    }

    const b: Bookmark = {
      id: raw.id,
      url: raw.url,
      title: raw.title,
      description: isStr(raw.description) ? raw.description : "",
      category: raw.category,
      tags: (raw.tags as string[] | undefined) ?? [],
      favicon: isStr(raw.favicon) ? raw.favicon : "",
      addedAt: raw.addedAt,
      pinned: raw.pinned === true,
    };
    if (typeof raw.sortOrder === "number" && Number.isFinite(raw.sortOrder)) b.sortOrder = raw.sortOrder;
    if (typeof raw.visitCount === "number" && raw.visitCount >= 0) b.visitCount = Math.floor(raw.visitCount);
    if (isStr(raw.lastVisitedAt) && !Number.isNaN(Date.parse(raw.lastVisitedAt))) b.lastVisitedAt = raw.lastVisitedAt;
    if (typeof raw.chromeVisitCount === "number" && raw.chromeVisitCount >= 0) b.chromeVisitCount = Math.floor(raw.chromeVisitCount);
    if (isStr(raw.lastChromeVisitAt) && !Number.isNaN(Date.parse(raw.lastChromeVisitAt))) b.lastChromeVisitAt = raw.lastChromeVisitAt;
    if (isObj(raw.chromeUsage)) {
      const usage: Record<string, { visits: number; lastVisitAt?: string; machine?: string }> = {};
      for (const [id, u] of Object.entries(raw.chromeUsage)) {
        if (!isObj(u) || typeof u.visits !== "number" || u.visits < 0) continue;
        usage[id] = { visits: Math.floor(u.visits) };
        if (isStr(u.lastVisitAt) && !Number.isNaN(Date.parse(u.lastVisitAt))) usage[id].lastVisitAt = u.lastVisitAt;
        if (isStr(u.machine)) usage[id].machine = u.machine;
      }
      if (Object.keys(usage).length) b.chromeUsage = usage;
    }
    out.push(b);
  }
  return { ok: true, value: out };
}

export function validateRules(data: unknown): Result<CategoryRules> {
  if (!isObj(data)) return { ok: false, error: "Expected an object of site → category" };
  for (const [host, category] of Object.entries(data)) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host)) return { ok: false, error: `Invalid site "${host}"` };
    if (!isStr(category) || !category.trim()) return { ok: false, error: `Rule for ${host} has no category` };
  }
  return { ok: true, value: data as CategoryRules };
}

/**
 * Accepts either the app's full JSON export ({ app, bookmarks, categoryRules })
 * or a raw bookmarks.json array.
 */
export function parseRestoreFile(data: unknown): Result<{ bookmarks: Bookmark[]; categoryRules?: CategoryRules }> {
  if (Array.isArray(data)) {
    const bookmarks = validateBookmarks(data);
    return bookmarks.ok ? { ok: true, value: { bookmarks: bookmarks.value } } : bookmarks;
  }
  if (!isObj(data) || !Array.isArray(data.bookmarks)) {
    return { ok: false, error: "Not a Linkdeck backup (expected an exported .json file or bookmarks.json)" };
  }
  const bookmarks = validateBookmarks(data.bookmarks);
  if (!bookmarks.ok) return bookmarks;
  if (data.categoryRules === undefined) return { ok: true, value: { bookmarks: bookmarks.value } };
  const rules = validateRules(data.categoryRules);
  if (!rules.ok) return rules;
  return { ok: true, value: { bookmarks: bookmarks.value, categoryRules: rules.value } };
}

type BookmarkDiff = {
  current: number;
  backup: number;
  /** In the backup but not now — would come back. */
  added: string[];
  /** Here now but not in the backup — would disappear. */
  removed: string[];
  /** In both but different (title, URL, category, pin…) — would revert. */
  changed: string[];
};

const comparable = (b: Bookmark) =>
  JSON.stringify([b.url, b.title, b.description, b.category, b.tags, b.favicon, b.pinned, b.sortOrder ?? null]);

/** What restoring `backup` over `current` would do (titles, for display). */
export function diffBookmarks(current: Bookmark[], backup: Bookmark[]): BookmarkDiff {
  const now = new Map(current.map((b) => [b.id, b]));
  const then = new Map(backup.map((b) => [b.id, b]));
  return {
    current: current.length,
    backup: backup.length,
    added: backup.filter((b) => !now.has(b.id)).map((b) => b.title),
    removed: current.filter((b) => !then.has(b.id)).map((b) => b.title),
    changed: backup.filter((b) => now.has(b.id) && comparable(now.get(b.id)!) !== comparable(b)).map((b) => b.title),
  };
}

type RulesDiff = { current: number; backup: number; added: string[]; removed: string[]; changed: string[] };

export function diffRules(current: CategoryRules, backup: CategoryRules): RulesDiff {
  const fmt = (host: string, cat: string) => `${host} → ${cat}`;
  const has = (obj: CategoryRules, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
  return {
    current: Object.keys(current).length,
    backup: Object.keys(backup).length,
    added: Object.entries(backup).filter(([h]) => !has(current, h)).map(([h, c]) => fmt(h, c)),
    removed: Object.entries(current).filter(([h]) => !has(backup, h)).map(([h, c]) => fmt(h, c)),
    changed: Object.entries(backup).filter(([h, c]) => has(current, h) && current[h] !== c).map(([h, c]) => fmt(h, c)),
  };
}
