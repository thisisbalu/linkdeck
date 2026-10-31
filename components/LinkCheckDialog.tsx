"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CircleCheck, ExternalLink, Loader2, Lock, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/components/BookmarkViewContext";
import type { LinkState, LinkStatus } from "@/lib/link-check";
import type { Bookmark } from "@/lib/types";

interface LinkCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmarks: Bookmark[];
  statuses: Record<string, LinkStatus>;
  onStatus: (id: string, status: LinkStatus) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const SECTIONS: { state: LinkState; title: string; icon: React.ReactNode; hint?: string }[] = [
  { state: "broken", title: "Broken", icon: <AlertTriangle className="h-3.5 w-3.5 text-red-400" /> },
  {
    state: "unreachable", title: "Unreachable", icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />,
    hint: "Internal sites may only be reachable on VPN.",
  },
  {
    state: "restricted", title: "Needs sign-in", icon: <Lock className="h-3.5 w-3.5" style={{ color: "var(--app-text-faint)" }} />,
    hint: "The site answered but asked for credentials — usually fine.",
  },
];

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export function LinkCheckDialog({ open, onOpenChange, bookmarks, statuses, onStatus, onEdit, onDelete }: LinkCheckDialogProps) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) abortRef.current?.abort();
  }, [open]);

  const checked = useMemo(() => bookmarks.filter((b) => statuses[b.id]), [bookmarks, statuses]);
  const lastChecked = useMemo(
    () => checked.map((b) => statuses[b.id].checkedAt).sort().at(-1),
    [checked, statuses]
  );
  const byState = (state: LinkState) => checked.filter((b) => statuses[b.id].state === state);
  const okCount = byState("ok").length;

  async function runCheck() {
    setRunning(true);
    setError("");
    setProgress({ done: 0, total: bookmarks.length });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/links/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.type === "start") setProgress({ done: 0, total: msg.total });
          if (msg.type === "result") {
            const { type: _t, id, ...status } = msg;
            onStatus(id, status as LinkStatus);
            setProgress((p) => ({ ...p, done: p.done + 1 }));
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl flex flex-col max-h-[85vh]"
        style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base font-semibold" style={{ color: "var(--app-text)" }}>Check links</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 shrink-0">
          <p className="text-xs" style={{ color: "var(--app-text-faint)" }}>
            {running
              ? `Checking ${progress.done} / ${progress.total}…`
              : lastChecked
                ? `Last checked ${timeAgo(lastChecked)} · ${okCount} of ${checked.length} working`
                : `Not checked yet. Each of your ${bookmarks.length} links gets a quick request from this computer.`}
          </p>
          <Button type="button" onClick={runCheck} disabled={running || bookmarks.length === 0}
            style={{ background: "var(--app-cta-bg)", color: "var(--app-cta-text)" }}>
            {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {lastChecked ? "Check again" : `Check ${bookmarks.length} links`}
          </Button>
        </div>

        {running && (
          <div className="h-1 rounded-full overflow-hidden shrink-0" style={{ background: "var(--app-border)" }}>
            <div className="h-full rounded-full transition-all duration-200"
              style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : "0%", background: "var(--app-text-muted)" }} />
          </div>
        )}

        {error && <p className="text-xs text-red-400 shrink-0">{error}</p>}

        <div className="overflow-y-auto flex-1 min-h-0 flex flex-col gap-4">
          {SECTIONS.map(({ state, title, icon, hint }) => {
            const items = byState(state);
            if (items.length === 0) return null;
            return (
              <section key={state} className="flex flex-col gap-1" aria-label={title}>
                <div className="flex items-center gap-1.5 pt-1">
                  {icon}
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-faint)" }}>
                    {title} ({items.length})
                  </span>
                  {hint && <span className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>— {hint}</span>}
                </div>
                {items.map((b) => (
                  <div key={b.id} className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-[var(--app-surface2)]">
                    {b.favicon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.favicon} alt="" width={14} height={14} className="rounded-sm shrink-0" />
                    ) : <span className="w-3.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: "var(--app-text)" }}>{b.title}</p>
                      <p className="text-[11px] truncate" style={{ color: "var(--app-text-faint)" }}>
                        {hostOf(b.url)} · {statuses[b.id].detail}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <a href={b.url} target="_blank" rel="noopener noreferrer" title="Open in new tab"
                        className="h-7 w-7 flex items-center justify-center rounded" style={{ color: "var(--app-text-faint)" }}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button type="button" title="Edit" onClick={() => onEdit(b.id)}
                        className="h-7 w-7 flex items-center justify-center rounded" style={{ color: "var(--app-text-faint)" }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" title="Delete" onClick={() => onDelete(b.id)}
                        className="h-7 w-7 flex items-center justify-center rounded hover:text-red-400" style={{ color: "var(--app-text-faint)" }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            );
          })}

          {!running && checked.length > 0 && okCount === checked.length && (
            <div className="flex flex-col items-center py-6 gap-1 text-center">
              <CircleCheck className="h-6 w-6 text-emerald-400" />
              <p className="text-sm" style={{ color: "var(--app-text)" }}>All links are working</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
