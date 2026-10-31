"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, CloudOff, FolderSync, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/components/BookmarkViewContext";
import type { FolderSummary, MoveResult, StorageStatus } from "@/lib/storage";

interface StorageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: StorageStatus | null;
  /** Called after the location changed, so the page reloads its data. */
  onChanged: () => void;
}

type Choice = { path: string; label: string; detail?: string; disabled?: boolean };
type NeedsChoice = Extract<MoveResult, { needsChoice: true }>;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function describe(s: FolderSummary): string {
  const parts = [];
  if (s.bookmarks !== null) parts.push(`${s.bookmarks} bookmark${s.bookmarks === 1 ? "" : "s"}`);
  if (s.rules) parts.push(`${s.rules} site rule${s.rules === 1 ? "" : "s"}`);
  if (s.bytes) parts.push(formatBytes(s.bytes));
  if (s.modifiedAt) parts.push(`changed ${timeAgo(s.modifiedAt)}`);
  return parts.join(" · ") || "empty";
}

const box = { background: "var(--app-surface2)", border: "1px solid var(--app-border)" } as const;
const cta = { background: "var(--app-cta-bg)", color: "var(--app-cta-text)" } as const;

export function StorageDialog({ open, onOpenChange, status, onChanged }: StorageDialogProps) {
  const [selected, setSelected] = useState<string>("");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [choice, setChoice] = useState<NeedsChoice | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(""); setCustom(""); setError(""); setNotice(""); setChoice(null);
  }, [open]);

  if (!status) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>
          <DialogHeader><DialogTitle className="text-base">Storage location</DialogTitle></DialogHeader>
          <p className="text-sm flex items-center gap-2" style={{ color: "var(--app-text-muted)" }}><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>
        </DialogContent>
      </Dialog>
    );
  }

  const locked = status.source === "env";
  const choices: Choice[] = [
    ...status.suggestions.map((s) => ({
      path: s.path,
      label: s.label,
      detail: s.hasData ? "already has Linkdeck data" : undefined,
      disabled: !s.parentExists,
    })),
    ...(!status.isDefault
      ? [{ path: status.defaultDir, label: "Project folder (default)", detail: "this Mac only, no cloud sync" }]
      : []),
    ...status.previousCopies.map((p) => ({ path: p.path, label: "Earlier copy in the project folder", detail: describe(p) })),
  ];
  const target = selected === "__custom__" ? custom.trim() : selected;

  async function move(mode: "auto" | "replace" | "use-existing") {
    if (!target) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/storage/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.needsChoice) { setChoice(data as NeedsChoice); return; }
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      const r = data as Extract<MoveResult, { needsChoice: false }>;
      setChoice(null);
      const verb = r.mode === "switched" ? "Now using the data in" : r.mode === "replaced" ? "Replaced the data in" : "Moved your data to";
      const copied = r.copied.files ? ` (${r.copied.files} files, ${formatBytes(r.copied.bytes)}, verified)` : "";
      const prev = r.previous ? ` The old project folder was kept as ${r.previous.split("/").pop()}.` : "";
      setNotice(`${verb} ${r.label}${copied}.${prev}`);
      setSelected(""); setCustom("");
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl flex flex-col max-h-[88vh]"
        style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base font-semibold" style={{ color: "var(--app-text)" }}>Storage location</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0 flex flex-col gap-4">
          {/* Current */}
          <section className="rounded-lg p-3 flex flex-col gap-1" style={box} aria-label="Current location">
            <div className="flex items-center gap-2">
              {status.available ? <FolderSync className="h-4 w-4 shrink-0" /> : <CloudOff className="h-4 w-4 shrink-0 text-red-400" />}
              <span className="text-sm font-medium">{status.label}</span>
              {status.isDefault && <span className="text-[10px] rounded px-1.5 py-0.5" style={{ background: "var(--app-border)" }}>default</span>}
            </div>
            <code className="text-[11px] break-all" style={{ color: "var(--app-text-faint)" }}>{status.dataDir}</code>
            <p className="text-[11px]" style={{ color: "var(--app-text-muted)" }}>
              {status.available ? describe(status.summary) : status.error}
            </p>
            {locked && (
              <p className="text-[11px] text-amber-400">Set by the LINKDECK_DATA_DIR environment variable, so it can't be changed here.</p>
            )}
          </section>

          {notice && (
            <div className="flex items-start gap-2 rounded-lg p-2.5 text-xs" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#34d399" }}>
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{notice}</span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-lg p-2.5 text-xs" style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", color: "#f87171" }}>
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          )}

          {choice ? (
            <section className="flex flex-col gap-3" aria-label="Folder already has data">
              <p className="text-sm">That folder already has Linkdeck data — perhaps from another Mac.</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg p-2.5" style={box}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-faint)" }}>In that folder</p>
                  <p className="text-xs mt-1">{describe(choice.existing)}</p>
                </div>
                <div className="rounded-lg p-2.5" style={box}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-faint)" }}>On this Mac now</p>
                  <p className="text-xs mt-1">{describe(choice.current)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy} onClick={() => move("use-existing")} style={cta}>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Use the data that's there
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => move("replace")} style={{ color: "var(--app-text-muted)" }}>
                  Replace it with this Mac's
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setChoice(null)} style={{ color: "var(--app-text-muted)" }}>
                  Cancel
                </Button>
              </div>
              <p className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>
                Replacing keeps the folder's current bookmarks and site rules as backups there, so either choice can be undone.
              </p>
            </section>
          ) : !locked && (
            <section className="flex flex-col gap-2" aria-label="Choose a new location">
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-faint)" }}>Move to</p>
              <div role="radiogroup" aria-label="New location" className="flex flex-col gap-1">
                {choices.map((c) => (
                  <label key={c.path} className={`flex items-start gap-2.5 rounded-md px-2.5 py-2 ${c.disabled ? "opacity-40" : "cursor-pointer hover:bg-[var(--app-surface2)]"}`}
                    style={{ background: selected === c.path ? "var(--app-surface2)" : undefined }}>
                    <input type="radio" name="storage-target" className="mt-1" disabled={c.disabled} checked={selected === c.path} onChange={() => setSelected(c.path)} />
                    <span className="flex flex-col min-w-0">
                      <span className="text-sm">{c.label}{c.detail && <span className="text-[11px] ml-2" style={{ color: "var(--app-text-faint)" }}>{c.detail}</span>}</span>
                      <code className="text-[11px] break-all" style={{ color: "var(--app-text-faint)" }}>{c.path}</code>
                    </span>
                  </label>
                ))}
                <label className="flex items-start gap-2.5 rounded-md px-2.5 py-2 cursor-pointer hover:bg-[var(--app-surface2)]"
                  style={{ background: selected === "__custom__" ? "var(--app-surface2)" : undefined }}>
                  <input type="radio" name="storage-target" className="mt-1" checked={selected === "__custom__"} onChange={() => setSelected("__custom__")} />
                  <span className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <span className="text-sm">Other folder…</span>
                    <input value={custom} onFocus={() => setSelected("__custom__")} onChange={(e) => setCustom(e.target.value)}
                      placeholder="~/Library/CloudStorage/…/Linkdeck" aria-label="Folder path" spellCheck={false}
                      className="h-8 rounded-md px-2 text-xs focus:outline-none focus:ring-1"
                      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }} />
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>
                  {status.available
                    ? "Everything is copied and checked before switching; the old folder is kept."
                    : "The current folder can't be read, so you can only switch to a folder that already has your data."}
                </p>
                <Button type="button" disabled={busy || !target} onClick={() => move(status.available ? "auto" : "use-existing")} style={cta}>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {status.available ? "Move here" : "Use this folder"}
                </Button>
              </div>
            </section>
          )}

          <p className="text-[11px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
            Using Box or OneDrive? In Finder, right-click the Linkdeck folder and choose <em>Always keep on this device</em> so it's
            always readable. Your bookmarks include internal links, so prefer IBM-managed storage (Box, OneDrive-IBM) over personal
            cloud drives. Linkdeck works the same on every Mac that points at the same folder; if two Macs change it at the same
            moment, you'll be asked how to combine the copies.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
