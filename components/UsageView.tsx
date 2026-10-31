"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Clock, Trophy } from "lucide-react";
import { BookmarkRow } from "@/components/BookmarkRow";
import { timeAgo } from "@/components/BookmarkViewContext";
import { comparatorFor, manualCompare } from "@/lib/sort";
import { CHROME_HISTORY_DAYS, lastUsedAt, usesOf } from "@/lib/usage";
import type { Bookmark } from "@/lib/types";

const TOP_N = 25;

interface UsageViewProps {
  mode: "most-used" | "recent";
  bookmarks: Bookmark[];
  /** Last Chrome-history sync from the extension, or null if it never synced. */
  syncedAt: string | null;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onEdit: (id: string) => void;
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function breakdown(b: Bookmark): string {
  const parts = [];
  if (b.chromeVisitCount) {
    const macs = Object.values(b.chromeUsage ?? {});
    const perMac = macs.length > 1
      ? ` — ${macs.map((m) => `${m.machine ?? "another Mac"}: ${m.visits}`).join(", ")}`
      : "";
    parts.push(`${b.chromeVisitCount} visit${b.chromeVisitCount === 1 ? "" : "s"} in Chrome (last ${CHROME_HISTORY_DAYS} days)${perMac}`);
  }
  if (b.visitCount) parts.push(`${b.visitCount} from Linkdeck`);
  return parts.join(" · ");
}

/** Site · category, hidden on narrow screens. */
function Context({ b }: { b: Bookmark }) {
  return (
    <span className="hidden sm:inline truncate max-w-[220px]">
      {hostOf(b.url)} · {b.category}
    </span>
  );
}

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function recentGroup(ms: number, now: Date): string {
  const today = dayStart(now);
  const day = 24 * 60 * 60 * 1000;
  if (ms >= today) return "Today";
  if (ms >= today - day) return "Yesterday";
  if (ms >= today - 6 * day) return "Last 7 days";
  if (ms >= today - 29 * day) return "Last 30 days";
  return "Earlier";
}

function recentTime(ms: number, group: string): string {
  const d = new Date(ms);
  if (group === "Today" || group === "Yesterday") return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (group === "Last 7 days") return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-faint)" }}>
      {children}
    </p>
  );
}

function EmptyState({ mode, syncedAt }: { mode: UsageViewProps["mode"]; syncedAt: string | null }) {
  const Icon = mode === "most-used" ? Trophy : Clock;
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-1.5">
      <Icon className="h-7 w-7 opacity-30" />
      <p className="text-sm font-medium" style={{ color: "var(--app-text-muted)" }}>
        {mode === "most-used" ? "Nothing to rank yet" : "Nothing opened yet"}
      </p>
      <p className="text-xs max-w-sm" style={{ color: "var(--app-text-faint)" }}>
        {syncedAt
          ? "Bookmarks you open — from here or anywhere in Chrome — will show up here."
          : "Bookmarks you open from this page will show up here. Reload the Linkdeck extension to also count visits from anywhere in Chrome."}
      </p>
    </div>
  );
}

export function UsageView({ mode, bookmarks, syncedAt, onPin, onDelete, onRename, onEdit }: UsageViewProps) {
  const [showAll, setShowAll] = useState(false);
  const [showUnused, setShowUnused] = useState(false);

  const used = useMemo(
    () => bookmarks.filter((b) => (mode === "most-used" ? usesOf(b) > 0 : lastUsedAt(b) > 0)).sort(comparatorFor(mode)),
    [bookmarks, mode]
  );
  const unused = useMemo(() => bookmarks.filter((b) => usesOf(b) === 0 && lastUsedAt(b) === 0).sort(manualCompare), [bookmarks]);

  const rowProps = { onPin, onDelete, onRename, onEdit, openInNewTab: false };

  const source = syncedAt
    ? `Includes Chrome visits from the last ${CHROME_HISTORY_DAYS} days · synced ${timeAgo(syncedAt)}`
    : "Counting opens from this page only — reload the Linkdeck extension to include Chrome history";

  let body: React.ReactNode;
  if (used.length === 0) {
    body = <EmptyState mode={mode} syncedAt={syncedAt} />;
  } else if (mode === "most-used") {
    const max = usesOf(used[0]);
    const shown = showAll ? used : used.slice(0, TOP_N);
    body = (
      <div className="flex flex-col py-1" role="list" aria-label="Most used bookmarks">
        {shown.map((b, i) => {
          const uses = usesOf(b);
          return (
            <div role="listitem" key={b.id}>
              <BookmarkRow
                bookmark={b}
                {...rowProps}
                leading={
                  <span className="w-5 shrink-0 text-right text-[11px] tabular-nums" style={{ color: "var(--app-text-faint)" }}>
                    {i + 1}
                  </span>
                }
                meta={
                  <span className="flex items-center gap-2.5" title={breakdown(b)}>
                    <Context b={b} />
                    <span aria-hidden className="h-1.5 rounded-full" style={{ width: 6 + Math.round((uses / max) * 54), background: "var(--app-text-faint)", opacity: 0.6 }} />
                    <span className="w-9 text-right tabular-nums font-medium" style={{ color: "var(--app-text-muted)" }}>{uses}×</span>
                  </span>
                }
              />
            </div>
          );
        })}
        {used.length > TOP_N && (
          <button type="button" onClick={() => setShowAll((v) => !v)}
            className="self-start ml-3 mt-1 text-[11px] flex items-center gap-1" style={{ color: "var(--app-text-faint)" }}>
            {showAll ? <><ChevronDown className="h-3 w-3" />Show top {TOP_N}</> : <><ChevronRight className="h-3 w-3" />Show all {used.length}</>}
          </button>
        )}
      </div>
    );
  } else {
    const now = new Date();
    const groups: [string, Bookmark[]][] = [];
    for (const b of used) {
      const g = recentGroup(lastUsedAt(b), now);
      if (groups.at(-1)?.[0] !== g) groups.push([g, []]);
      groups.at(-1)![1].push(b);
    }
    body = (
      <div className="flex flex-col pb-1">
        {groups.map(([label, items]) => (
          <section key={label} aria-label={label}>
            <SectionLabel>{label}</SectionLabel>
            {items.map((b) => (
              <BookmarkRow
                key={b.id}
                bookmark={b}
                {...rowProps}
                meta={
                  <span className="flex items-center gap-2.5" title={breakdown(b)}>
                    <Context b={b} />
                    <span className="tabular-nums" style={{ color: "var(--app-text-muted)" }}>{recentTime(lastUsedAt(b), label)}</span>
                  </span>
                }
              />
            ))}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="ld-card ld-card-solid rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)" }}>
        {body}
        {unused.length > 0 && used.length > 0 && (
          <div style={{ borderTop: "1px solid var(--app-border-soft)" }}>
            <button type="button" onClick={() => setShowUnused((v) => !v)} aria-expanded={showUnused}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
              {showUnused ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Not opened yet ({unused.length})
            </button>
            {showUnused && (
              <div className="pb-1">
                {unused.map((b) => <BookmarkRow key={b.id} bookmark={b} {...rowProps} />)}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="text-[11px] px-1" style={{ color: "var(--app-text-faint)" }}>{source}</p>
    </div>
  );
}
