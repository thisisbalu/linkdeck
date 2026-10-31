import { lastUsedAt, usesOf } from "./usage";
import type { Bookmark } from "./types";

export type SortMode = "manual" | "most-used" | "recent";

export const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "most-used", label: "Most used" },
  { id: "recent", label: "Recent" },
];

/** Your drag-and-drop order; unordered bookmarks fall back to newest first. */
export function manualCompare(a: Bookmark, b: Bookmark): number {
  const ao = a.sortOrder ?? 9999;
  const bo = b.sortOrder ?? 9999;
  if (ao !== bo) return ao - bo;
  return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
}

export function comparatorFor(mode: SortMode): (a: Bookmark, b: Bookmark) => number {
  switch (mode) {
    case "most-used":
      return (a, b) => usesOf(b) - usesOf(a) || lastUsedAt(b) - lastUsedAt(a) || manualCompare(a, b);
    case "recent":
      return (a, b) => lastUsedAt(b) - lastUsedAt(a) || manualCompare(a, b);
    default:
      return manualCompare;
  }
}
