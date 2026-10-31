import type { Bookmark } from "./types";

/**
 * How often a bookmark is used. Opening a bookmark from Linkdeck also
 * creates a Chrome history visit, so the two counts overlap — take the
 * larger rather than adding them.
 */
export function usesOf(b: Bookmark): number {
  return Math.max(b.chromeVisitCount ?? 0, b.visitCount ?? 0);
}

/** Most recent open, from Chrome history or Linkdeck (ms since epoch; 0 = never). */
export function lastUsedAt(b: Bookmark): number {
  const t = (iso?: string) => (iso ? new Date(iso).getTime() || 0 : 0);
  return Math.max(t(b.lastChromeVisitAt), t(b.lastVisitedAt));
}

/** Window used for Chrome history counts. */
export const CHROME_HISTORY_DAYS = 90;
