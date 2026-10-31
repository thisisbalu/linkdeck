import { readJSON, writeJSON } from "./fs-store";
import { backupIfDue } from "./backup";
import { withLock as withKeyedLock } from "./lock";
import { assertStorageAvailable, backupsDir, bookmarksFile } from "./paths";
import { thisMachine } from "./machine";
import { normalizeUrl } from "./url";
import type { Bookmark, ChromeMachineUsage } from "./types";
import type { EditableFields, ReorderItem } from "./bookmark-input";


export class BookmarkNotFoundError extends Error {
  constructor(id: string) {
    super(`Bookmark ${id} not found`);
    this.name = "BookmarkNotFoundError";
  }
}

export class DuplicateBookmarkError extends Error {
  constructor(public readonly existing: Bookmark) {
    super("This URL is already bookmarked");
    this.name = "DuplicateBookmarkError";
  }
}

// Every read-modify-write goes through this queue so concurrent requests
// (e.g. a bulk import plus an extension save) cannot overwrite each other.
const withLock = <T>(fn: () => Promise<T>) => withKeyedLock("bookmarks", fn);

function findByUrl(bookmarks: Bookmark[], url: string, excludeId?: string): Bookmark | undefined {
  const key = normalizeUrl(url);
  return bookmarks.find((b) => b.id !== excludeId && normalizeUrl(b.url) === key);
}

export async function readBookmarks(): Promise<Bookmark[]> {
  assertStorageAvailable();
  return (await readJSON<Bookmark[]>(bookmarksFile())) ?? [];
}

/** Replaces every bookmark (used by restore). Always snapshots the current file first. */
export function replaceAllBookmarks(bookmarks: Bookmark[]): Promise<string | null> {
  return withLock(async () => {
    const safety = backupIfDue(bookmarksFile(), backupsDir(), { intervalMs: 0 });
    await writeJSON(bookmarksFile(), bookmarks);
    return safety;
  });
}

/** Read-modify-write of the whole list under the lock, with a safety backup first. */
export function transformAllBookmarks(fn: (current: Bookmark[]) => Bookmark[]): Promise<Bookmark[]> {
  return withLock(async () => {
    const next = fn(await readBookmarks());
    backupIfDue(bookmarksFile(), backupsDir(), { intervalMs: 0 });
    await writeJSON(bookmarksFile(), next);
    return next;
  });
}

async function writeBookmarks(bookmarks: Bookmark[]): Promise<void> {
  try {
    backupIfDue(bookmarksFile(), backupsDir());
  } catch (err) {
    // A failed backup must never block saving.
    console.warn("bookmarks backup failed:", err);
  }
  await writeJSON(bookmarksFile(), bookmarks);
}

export async function findBookmarkByUrl(url: string): Promise<Bookmark | undefined> {
  return findByUrl(await readBookmarks(), url);
}

/** Adds a bookmark; throws DuplicateBookmarkError if the URL is already saved. */
export function addBookmark(bookmark: Bookmark): Promise<Bookmark> {
  return withLock(async () => {
    const bookmarks = await readBookmarks();
    const existing = findByUrl(bookmarks, bookmark.url);
    if (existing) throw new DuplicateBookmarkError(existing);
    bookmarks.push(bookmark);
    await writeBookmarks(bookmarks);
    return bookmark;
  });
}

export function deleteBookmark(id: string): Promise<void> {
  return withLock(async () => {
    const bookmarks = await readBookmarks();
    await writeBookmarks(bookmarks.filter((b) => b.id !== id));
  });
}

/**
 * Applies already-validated updates. `favicon` may be supplied by the server
 * when the URL's host changes; it is never accepted from clients.
 */
export function updateBookmark(
  id: string,
  updates: Partial<EditableFields> & { favicon?: string }
): Promise<Bookmark> {
  return withLock(async () => {
    const bookmarks = await readBookmarks();
    const index = bookmarks.findIndex((b) => b.id === id);
    if (index === -1) throw new BookmarkNotFoundError(id);
    if (updates.url) {
      const conflict = findByUrl(bookmarks, updates.url, id);
      if (conflict) throw new DuplicateBookmarkError(conflict);
    }
    bookmarks[index] = { ...bookmarks[index], ...updates };
    await writeBookmarks(bookmarks);
    return bookmarks[index];
  });
}

/**
 * Persists drag-and-drop results: new sortOrder values and, for
 * cross-category moves, the new category. Unknown ids are ignored.
 */
export function reorderBookmarks(items: ReorderItem[]): Promise<void> {
  return withLock(async () => {
    const bookmarks = await readBookmarks();
    const byId = new Map(items.map((item) => [item.id, item]));
    const updated = bookmarks.map((b) => {
      const item = byId.get(b.id);
      if (!item) return b;
      return {
        ...b,
        sortOrder: item.sortOrder,
        ...(item.category ? { category: item.category } : {}),
      };
    });
    await writeBookmarks(updated);
  });
}

/**
 * Sets the category of several bookmarks at once. Unknown ids are ignored.
 * Returns the updated bookmarks.
 */
export function setCategories(items: { id: string; category: string }[]): Promise<Bookmark[]> {
  return withLock(async () => {
    const bookmarks = await readBookmarks();
    const byId = new Map(items.map((i) => [i.id, i.category]));
    const changed: Bookmark[] = [];
    const updated = bookmarks.map((b) => {
      const category = byId.get(b.id);
      if (category === undefined || category === b.category) return b;
      const next = { ...b, category };
      changed.push(next);
      return next;
    });
    if (changed.length) await writeBookmarks(updated);
    return changed;
  });
}

/** Applies the same pin/category change to several bookmarks. Returns the changed ones. */
export function bulkUpdate(ids: string[], changes: { pinned?: boolean; category?: string }): Promise<Bookmark[]> {
  return withLock(async () => {
    const wanted = new Set(ids);
    const bookmarks = await readBookmarks();
    const changed: Bookmark[] = [];
    const updated = bookmarks.map((b) => {
      if (!wanted.has(b.id)) return b;
      const next = { ...b, ...changes };
      if (next.pinned !== b.pinned || next.category !== b.category) changed.push(next);
      return next;
    });
    if (changed.length) await writeBookmarks(updated);
    return changed;
  });
}

/** Deletes several bookmarks. Returns how many were removed. */
export function bulkDelete(ids: string[]): Promise<number> {
  return withLock(async () => {
    const wanted = new Set(ids);
    const bookmarks = await readBookmarks();
    const kept = bookmarks.filter((b) => !wanted.has(b.id));
    if (kept.length !== bookmarks.length) await writeBookmarks(kept);
    return bookmarks.length - kept.length;
  });
}

/** Counts an open from Linkdeck. */
export function recordVisit(id: string, at = new Date()): Promise<Bookmark> {
  return withLock(async () => {
    const bookmarks = await readBookmarks();
    const index = bookmarks.findIndex((b) => b.id === id);
    if (index === -1) throw new BookmarkNotFoundError(id);
    bookmarks[index] = {
      ...bookmarks[index],
      visitCount: (bookmarks[index].visitCount ?? 0) + 1,
      lastVisitedAt: at.toISOString(),
    };
    await writeBookmarks(bookmarks);
    return bookmarks[index];
  });
}

type ChromeUsage = { id: string; visits: number; lastVisitAt: string | null };

/**
 * Recomputes the summed chromeVisitCount / lastChromeVisitAt from the per-Mac
 * map. Bookmarks synced before per-Mac tracking only have the summed fields;
 * those are replaced once this Mac reports its own counts.
 */
export function withChromeTotals(b: Bookmark, usage: Record<string, ChromeMachineUsage>): Bookmark {
  const next: Bookmark = { ...b };
  const entries = Object.values(usage);
  if (entries.length === 0) {
    delete next.chromeUsage;
    next.chromeVisitCount = 0;
    delete next.lastChromeVisitAt;
    return next;
  }
  next.chromeUsage = usage;
  next.chromeVisitCount = entries.reduce((sum, u) => sum + u.visits, 0);
  const last = entries.map((u) => u.lastVisitAt).filter((d): d is string => !!d).sort().at(-1);
  if (last) next.lastChromeVisitAt = last;
  else delete next.lastChromeVisitAt;
  return next;
}

/**
 * Stores this Mac's Chrome-history visit counts (synced by its extension),
 * keeping other Macs' counts and adding them up. Only rewrites bookmarks.json
 * when something actually changed. Returns how many bookmarks changed.
 */
export function setChromeUsage(items: ChromeUsage[], machine = thisMachine()): Promise<number> {
  return withLock(async () => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const bookmarks = await readBookmarks();
    let changed = 0;
    const updated = bookmarks.map((b) => {
      const u = byId.get(b.id);
      if (!u) return b;
      const usage = { ...(b.chromeUsage ?? {}) };
      if (u.visits > 0) {
        usage[machine.id] = { visits: u.visits, ...(u.lastVisitAt ? { lastVisitAt: u.lastVisitAt } : {}), machine: machine.name };
      } else {
        delete usage[machine.id];
      }
      const next = withChromeTotals(b, usage);
      const same =
        JSON.stringify(b.chromeUsage ?? {}) === JSON.stringify(next.chromeUsage ?? {}) &&
        (b.chromeVisitCount ?? 0) === (next.chromeVisitCount ?? 0) &&
        b.lastChromeVisitAt === next.lastChromeVisitAt;
      if (same) return b;
      changed++;
      return next;
    });
    if (changed) await writeBookmarks(updated);
    return changed;
  });
}
