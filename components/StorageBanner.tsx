"use client";

import { useState } from "react";
import { CloudOff, GitMerge, Loader2, RefreshCw } from "lucide-react";
import { timeAgo } from "@/components/BookmarkViewContext";
import type { StorageStatus } from "@/lib/storage";
import type { ConflictAction } from "@/lib/conflicts";

interface StorageBannerProps {
  status: StorageStatus | null;
  /** Shown before the first status loads (from the server render). */
  initialError: string | null;
  onRetry: () => void;
  onOpenSettings: () => void;
  onResolved: () => void;
}

const btn = "h-7 px-2.5 rounded-md text-xs font-medium transition-opacity hover:opacity-85 disabled:opacity-40";

export function StorageBanner({ status, initialError, onRetry, onOpenSettings, onResolved }: StorageBannerProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const unavailable = status ? (!status.available ? status.error : null) : initialError;
  const where = status?.label && status.label !== "Custom folder" && status.label !== "Project folder" ? status.label : "your cloud drive";

  async function resolve(file: string, action: ConflictAction) {
    setBusy(`${file}:${action}`); setError("");
    try {
      const res = await fetch("/api/storage/conflicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      onResolved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (unavailable) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm"
        style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.35)", color: "var(--app-text)" }}>
        <CloudOff className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
        <div className="flex-1 min-w-0">
          <p className="font-medium">Your bookmarks can't be reached right now</p>
          <p className="text-xs mt-0.5 break-words" style={{ color: "var(--app-text-muted)" }}>{unavailable}</p>
          <p className="text-[11px] mt-1" style={{ color: "var(--app-text-faint)" }}>Checking again every few seconds — this page reloads by itself when it's back.</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button type="button" className={btn} onClick={onRetry} style={{ background: "var(--app-cta-bg)", color: "var(--app-cta-text)" }}>
            <RefreshCw className="inline h-3 w-3 mr-1" />Retry
          </button>
          <button type="button" className={btn} onClick={onOpenSettings} style={{ color: "var(--app-text-muted)" }}>Storage…</button>
        </div>
      </div>
    );
  }

  const conflicts = status?.conflicts ?? [];
  if (conflicts.length === 0) return null;

  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl px-4 py-3 text-sm"
      style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)", color: "var(--app-text)" }}>
      {conflicts.map((c) => {
        const what = c.kind === "bookmarks" ? "bookmarks" : "site rules";
        const n = c.count === null ? "" : `${c.count} ${c.kind === "bookmarks" ? "bookmark" : "rule"}${c.count === 1 ? "" : "s"}, `;
        const adds = c.kind === "bookmarks" && c.wouldAdd !== undefined
          ? c.wouldAdd > 0 ? ` Merging adds ${c.wouldAdd} bookmark${c.wouldAdd === 1 ? "" : "s"} you don't have here.` : " Merging adds nothing new."
          : "";
        return (
          <div key={c.file} className="flex items-start gap-3">
            <GitMerge className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
            <div className="flex-1 min-w-0">
              <p className="font-medium">{where} kept two versions of your {what}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--app-text-muted)" }}>
                The other copy is <code>{c.file}</code> ({n}changed {timeAgo(c.modifiedAt)}), probably saved on another Mac at the same moment.
                {c.valid ? adds : " It can't be read, so it can only be set aside."} Whatever you choose, the other copy is kept as a backup.
              </p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {c.valid && (
                <button type="button" className={btn} disabled={!!busy} onClick={() => resolve(c.file, "merge")}
                  style={{ background: "var(--app-cta-bg)", color: "var(--app-cta-text)" }} title="Keep everything from both; where both have the same bookmark, keep this Mac's version">
                  {busy === `${c.file}:merge` && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}Merge
                </button>
              )}
              <button type="button" className={btn} disabled={!!busy} onClick={() => resolve(c.file, "keep-mine")} style={{ color: "var(--app-text-muted)" }}>
                Keep mine
              </button>
              {c.valid && (
                <button type="button" className={btn} disabled={!!busy} onClick={() => resolve(c.file, "keep-theirs")} style={{ color: "var(--app-text-muted)" }}>
                  Keep theirs
                </button>
              )}
            </div>
          </div>
        );
      })}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
