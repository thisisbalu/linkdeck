"use client";

import { createContext, useContext } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { manualCompare } from "@/lib/sort";
import { openBookmarkInPlace, recordVisit } from "@/lib/navigation";
import type { LinkStatus } from "@/lib/link-check";
import type { Bookmark } from "@/lib/types";

/** Shared view state for bookmark chips/rows, so it isn't threaded through every component. */
export type BookmarkView = {
  selecting: boolean;
  isSelected: (id: string) => boolean;
  toggleSelected: (id: string) => void;
  linkStatus: Record<string, LinkStatus>;
  dragEnabled: boolean;
  compare: (a: Bookmark, b: Bookmark) => number;
  /** Opens a bookmark and counts the visit. */
  openBookmark: (bookmark: Bookmark, options?: { newTab?: boolean }) => void;
};

export const BookmarkViewContext = createContext<BookmarkView>({
  selecting: false,
  isSelected: () => false,
  toggleSelected: () => {},
  linkStatus: {},
  dragEnabled: true,
  compare: manualCompare,
  openBookmark: (b, options) => {
    recordVisit(b.id);
    if (options?.newTab) window.open(b.url, "_blank", "noopener,noreferrer");
    else openBookmarkInPlace(b.url);
  },
});

export const useBookmarkView = () => useContext(BookmarkViewContext);

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Red/amber warning icon for bookmarks whose last link check failed. */
export function LinkStatusIcon({ id, size = 12 }: { id: string; size?: number }) {
  const status = useBookmarkView().linkStatus[id];
  if (!status || (status.state !== "broken" && status.state !== "unreachable")) return null;
  const color = status.state === "broken" ? "text-red-400" : "text-amber-400";
  const label = `${status.state === "broken" ? "Broken link" : "Unreachable"}: ${status.detail} · checked ${timeAgo(status.checkedAt)}`;
  return (
    <span title={label} aria-label={label} className={`shrink-0 ${color}`}>
      <AlertTriangle style={{ width: size, height: size }} />
    </span>
  );
}

/** Round checkbox shown on chips/rows in selection mode. */
export function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className="shrink-0 h-3.5 w-3.5 rounded-full flex items-center justify-center"
      style={{
        border: `1.5px solid ${selected ? "var(--app-text)" : "var(--app-text-faint)"}`,
        background: selected ? "var(--app-text)" : "transparent",
        color: "var(--app-bg)",
      }}
    >
      {selected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
    </span>
  );
}

export { timeAgo };
