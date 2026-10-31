"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, DatabaseBackup, FileUp, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/components/BookmarkViewContext";

type Entry = { name: string; createdAt: string; count: number | null; size: number };
type Kind = "bookmarks" | "rules";
type Diff = { current: number; backup: number; added: string[]; removed: string[]; changed: string[] };
type FileSummary = { body: unknown; bookmarks: number; rules: number | null; exportedAt?: string; fileName: string };

interface BackupsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after anything was restored so the page can reload its data. */
  onRestored: () => void;
}

const NOUN: Record<Kind, [string, string]> = { bookmarks: ["bookmark", "bookmarks"], rules: ["site rule", "site rules"] };
const plural = (n: number, kind: Kind) => `${n} ${NOUN[kind][n === 1 ? 0 : 1]}`;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function TitleList({ label, items, tone }: { label: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  const shown = items.slice(0, 5);
  return (
    <p className="text-[11px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
      <span className={`font-semibold ${tone}`}>{label} ({items.length}):</span>{" "}
      {shown.join(" · ")}{items.length > shown.length && ` · +${items.length - shown.length} more`}
    </p>
  );
}

function DiffSummary({ diff, kind }: { diff: Diff; kind: Kind }) {
  const same = !diff.added.length && !diff.removed.length && !diff.changed.length;
  if (same) return <p className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>Identical to your current {NOUN[kind][1]}.</p>;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>
        You have {plural(diff.current, kind)} now; this backup has {diff.backup}. Restoring would:
      </p>
      <TitleList label="Bring back" items={diff.added} tone="text-emerald-400" />
      <TitleList label="Remove" items={diff.removed} tone="text-red-400" />
      <TitleList label="Revert" items={diff.changed} tone="text-amber-400" />
    </div>
  );
}

export function BackupsDialog({ open, onOpenChange, onRestored }: BackupsDialogProps) {
  const [kind, setKind] = useState<Kind>("bookmarks");
  const [lists, setLists] = useState<Record<Kind, Entry[]>>({ bookmarks: [], rules: [] });
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; diff?: Diff; error?: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [file, setFile] = useState<FileSummary | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/backups");
      const data = await res.json();
      setLists({ bookmarks: data.bookmarks ?? [], rules: data.rules ?? [] });
    } catch {
      setError("Could not load backups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setKind("bookmarks");
    setExpanded(null);
    setPreview(null);
    setConfirming(null);
    setNotice("");
    setError("");
    setFile(null);
    load();
  }, [open, load]);

  async function toggle(entry: Entry) {
    setConfirming(null);
    if (expanded === entry.name) { setExpanded(null); return; }
    setExpanded(entry.name);
    setPreview({ name: entry.name });
    try {
      const res = await fetch(`/api/backups/${encodeURIComponent(entry.name)}`);
      const data = await res.json();
      setPreview(res.ok ? { name: entry.name, diff: data.diff } : { name: entry.name, error: data.error });
    } catch {
      setPreview({ name: entry.name, error: "Could not read this backup" });
    }
  }

  async function post(url: string, body: unknown = {}) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
    return data;
  }

  async function backUpNow() {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await post("/api/backups");
      setNotice(data.created.length ? "Backup created." : "Nothing to back up yet.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restore(entry: Entry) {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await post(`/api/backups/${encodeURIComponent(entry.name)}/restore`);
      setNotice(`Restored ${plural(data.count, kind)} from ${formatDate(entry.createdAt)}. Your previous ${NOUN[kind][1]} were saved as a new backup — restore it to undo.`);
      setExpanded(null); setConfirming(null);
      onRestored();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(f: File) {
    setError(""); setNotice(""); setFile(null);
    try {
      const body = JSON.parse(await f.text());
      const bookmarks = Array.isArray(body) ? body : body?.bookmarks;
      if (!Array.isArray(bookmarks)) throw new Error();
      const rules = !Array.isArray(body) && body?.categoryRules && typeof body.categoryRules === "object"
        ? Object.keys(body.categoryRules).length : null;
      setFile({ body, bookmarks: bookmarks.length, rules, exportedAt: body?.exportedAt, fileName: f.name });
    } catch {
      setError(`${f.name} isn't a Linkdeck backup. Use a file from "Export full backup (.json)" or a bookmarks.json.`);
    }
  }

  async function restoreFile() {
    if (!file) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await post("/api/backups/restore-file", file.body);
      setNotice(`Restored ${plural(data.bookmarks, "bookmarks")}${data.rules !== null ? ` and ${plural(data.rules, "rules")}` : ""} from ${file.fileName}. Your previous data was saved as a backup.`);
      setFile(null); setConfirming(null);
      onRestored();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const entries = lists[kind];
  const ctaStyle = { background: "var(--app-cta-bg)", color: "var(--app-cta-text)" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl flex flex-col max-h-[85vh]"
        style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base font-semibold" style={{ color: "var(--app-text)" }}>Restore from backup</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 shrink-0">
          <div role="tablist" aria-label="Backup type" className="flex gap-1">
            {(["bookmarks", "rules"] as Kind[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k}
                onClick={() => { setKind(k); setExpanded(null); setConfirming(null); }}
                className="px-2.5 py-1 rounded-md text-xs transition-colors"
                style={{ background: kind === k ? "var(--app-surface2)" : "transparent", color: kind === k ? "var(--app-text)" : "var(--app-text-faint)" }}>
                {k === "bookmarks" ? "Bookmarks" : "Site rules"} ({lists[k].length})
              </button>
            ))}
          </div>
          <Button type="button" variant="ghost" onClick={backUpNow} disabled={busy} className="h-7 text-xs" style={{ color: "var(--app-text-muted)" }}>
            <DatabaseBackup className="h-3.5 w-3.5" /> Back up now
          </Button>
        </div>

        <p className="text-[11px] shrink-0" style={{ color: "var(--app-text-faint)" }}>
          Backups are taken automatically before changes (at most once an hour; the newest 48 are kept).
          Restoring saves your current data as a new backup first, so you can always undo it.
        </p>

        {notice && (
          <div className="flex items-start gap-2 rounded-lg p-2.5 text-xs shrink-0"
            style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#34d399" }}>
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{notice}</span>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-lg p-2.5 text-xs shrink-0"
            style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", color: "#f87171" }}>
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{error}</span>
          </div>
        )}

        <div className="overflow-y-auto flex-1 min-h-0 flex flex-col gap-0.5" role="list" aria-label="Backups">
          {loading ? (
            <div className="flex items-center gap-2 text-sm py-4" style={{ color: "var(--app-text-muted)" }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Loading backups…
            </div>
          ) : entries.length === 0 ? (
            <p className="text-xs py-4" style={{ color: "var(--app-text-faint)" }}>No {NOUN[kind][1]} backups yet.</p>
          ) : entries.map((e) => {
            const isOpen = expanded === e.name;
            const diff = preview?.name === e.name ? preview.diff : undefined;
            const identical = diff && !diff.added.length && !diff.removed.length && !diff.changed.length;
            return (
              <div key={e.name} role="listitem" className="rounded-md" style={{ background: isOpen ? "var(--app-surface2)" : "transparent" }}>
                <button type="button" onClick={() => toggle(e)} aria-expanded={isOpen}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-md hover:bg-[var(--app-surface2)]">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  <span className="text-sm flex-1" style={{ color: "var(--app-text)" }}>{formatDate(e.createdAt)}</span>
                  <span className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>
                    {e.count === null ? "unreadable" : plural(e.count, kind)} · {timeAgo(e.createdAt)}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-7 pb-2.5 flex flex-col gap-2">
                    {preview?.error ? (
                      <p className="text-[11px] text-red-400">{preview.error}</p>
                    ) : !diff ? (
                      <p className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--app-text-faint)" }}>
                        <Loader2 className="h-3 w-3 animate-spin" /> Comparing with your current {NOUN[kind][1]}…
                      </p>
                    ) : (
                      <>
                        <DiffSummary diff={diff} kind={kind} />
                        {!identical && (confirming === e.name ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px]" style={{ color: "var(--app-text-muted)" }}>
                              Replace your current {plural(diff.current, kind)} with this backup?
                            </span>
                            <Button type="button" variant="ghost" className="h-7 text-xs" onClick={() => setConfirming(null)} style={{ color: "var(--app-text-muted)" }}>Cancel</Button>
                            <Button type="button" className="h-7 text-xs" disabled={busy} onClick={() => restore(e)} style={ctaStyle}>
                              {busy && <Loader2 className="h-3 w-3 animate-spin" />} Restore
                            </Button>
                          </div>
                        ) : (
                          <div>
                            <Button type="button" className="h-7 text-xs" onClick={() => setConfirming(e.name)} style={ctaStyle}>
                              Restore this backup…
                            </Button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="shrink-0 pt-3 flex flex-col gap-2" style={{ borderTop: "1px solid var(--app-border-soft)" }}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>
              Have an exported file? Restore bookmarks and site rules from <em>Export full backup (.json)</em>.
            </p>
            <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" aria-label="Backup file"
              onChange={(ev) => { const f = ev.target.files?.[0]; if (f) pickFile(f); ev.target.value = ""; }} />
            <Button type="button" variant="ghost" className="h-7 text-xs shrink-0" onClick={() => fileInput.current?.click()} style={{ color: "var(--app-text-muted)" }}>
              <FileUp className="h-3.5 w-3.5" /> Choose file…
            </Button>
          </div>
          {file && (
            <div className="flex items-center gap-2 rounded-md px-2.5 py-2" style={{ background: "var(--app-surface2)" }}>
              <span className="text-[11px] flex-1" style={{ color: "var(--app-text-muted)" }}>
                <strong>{file.fileName}</strong>: {plural(file.bookmarks, "bookmarks")}
                {file.rules !== null && <>, {plural(file.rules, "rules")}</>}
                {file.exportedAt && <> · exported {formatDate(file.exportedAt)}</>}. This replaces everything you have now.
              </span>
              <Button type="button" variant="ghost" className="h-7 text-xs" onClick={() => setFile(null)} style={{ color: "var(--app-text-muted)" }}>Cancel</Button>
              <Button type="button" className="h-7 text-xs" disabled={busy} onClick={restoreFile} style={ctaStyle}>
                {busy && <Loader2 className="h-3 w-3 animate-spin" />} Restore from file
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
