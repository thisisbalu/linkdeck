"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Bookmark } from "@/lib/types";

type Suggestion = { category: string; reason: string } | null;
type Row = { bookmark: Bookmark; category: string; selected: boolean; suggestion: Suggestion };

interface TidyCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmarks: Bookmark[];
  onApplied: (updated: Bookmark[]) => void;
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

const inputStyle: React.CSSProperties = {
  background: "var(--app-surface2)",
  border: "1px solid var(--app-border)",
  color: "var(--app-text)",
};

export function TidyCategoriesDialog({ open, onOpenChange, bookmarks, onApplied }: TidyCategoriesDialogProps) {
  const listId = useId();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [rules, setRules] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [remember, setRemember] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/bookmarks/categorize");
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json() as {
        items: { id: string; suggestion: Suggestion }[];
        rules: Record<string, string>;
        categories: string[];
      };
      const byId = new Map(bookmarks.map((b) => [b.id, b]));
      setRows(
        data.items
          .filter((i) => byId.has(i.id))
          .map((i) => ({
            bookmark: byId.get(i.id)!,
            suggestion: i.suggestion,
            category: i.suggestion?.category ?? "",
            selected: !!i.suggestion,
          }))
          .sort((a, b) => Number(b.selected) - Number(a.selected) || a.bookmark.title.localeCompare(b.bookmark.title))
      );
      setRules(data.rules);
      setCategories(data.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load suggestions");
    } finally {
      setLoading(false);
    }
  // bookmarks is read only to resolve titles/favicons when (re)loading
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) {
      setNotice("");
      setRemember(true);
      load();
    }
  }, [open, load]);

  const selected = useMemo(
    () => rows.filter((r) => r.selected && r.category.trim() && r.category.trim() !== "General"),
    [rows]
  );

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.bookmark.id === id ? { ...r, ...patch } : r)));
  }

  async function apply() {
    if (selected.length === 0) return;
    setApplying(true);
    setError("");
    try {
      const res = await fetch("/api/bookmarks/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selected.map((r) => ({ id: r.bookmark.id, category: r.category.trim() })),
          remember,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      const updated = data.updated as Bookmark[];
      onApplied(updated);
      setRules(data.rules);
      setRows((prev) => prev.filter((r) => !updated.some((u) => u.id === r.bookmark.id)));
      setNotice(`Moved ${updated.length} bookmark${updated.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply changes");
    } finally {
      setApplying(false);
    }
  }

  async function removeRule(host: string) {
    const res = await fetch(`/api/category-rules?host=${encodeURIComponent(host)}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setRules((await res.json()).rules);
  }

  const ruleEntries = Object.entries(rules).sort(([a], [b]) => a.localeCompare(b));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl flex flex-col max-h-[85vh]"
        style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
            Tidy up categories
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0 flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm py-6" style={{ color: "var(--app-text-muted)" }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Finding suggestions…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center gap-1">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              <p className="text-sm font-medium" style={{ color: "var(--app-text)" }}>Nothing left in General</p>
              {notice && <p className="text-xs" style={{ color: "var(--app-text-faint)" }}>{notice}</p>}
            </div>
          ) : (
            <>
              <p className="text-xs" style={{ color: "var(--app-text-faint)" }}>
                {rows.length} bookmark{rows.length === 1 ? " is" : "s are"} in <strong>General</strong>.
                Suggestions are filled in — change any category, untick what you want to leave, then apply.
                {notice && <span className="text-emerald-400"> {notice}</span>}
              </p>

              <datalist id={listId}>
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>

              <div className="flex flex-col gap-1">
                {rows.map((r) => (
                  <div key={r.bookmark.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5"
                    style={{ background: r.selected ? "var(--app-surface2)" : "transparent" }}>
                    <input type="checkbox" aria-label={`Move ${r.bookmark.title}`} checked={r.selected}
                      onChange={(e) => updateRow(r.bookmark.id, { selected: e.target.checked })} />
                    {r.bookmark.favicon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.bookmark.favicon} alt="" width={14} height={14} className="rounded-sm shrink-0" />
                    ) : <span className="w-3.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: "var(--app-text)" }}>{r.bookmark.title}</p>
                      <p className="text-[11px] truncate" style={{ color: "var(--app-text-faint)" }}>
                        {hostOf(r.bookmark.url)}{r.suggestion && <> · {r.suggestion.reason}</>}
                      </p>
                    </div>
                    <input
                      list={listId}
                      value={r.category}
                      placeholder="Category"
                      aria-label={`Category for ${r.bookmark.title}`}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateRow(r.bookmark.id, { category: v, selected: !!v.trim() && v.trim() !== "General" });
                      }}
                      className="w-40 h-7 rounded-md px-2 text-xs focus:outline-none focus:ring-1"
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {ruleEntries.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1" style={{ borderTop: "1px solid var(--app-border-soft)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider pt-3" style={{ color: "var(--app-text-faint)" }}>
                Site rules
              </p>
              <p className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>
                New bookmarks from these sites are filed automatically.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ruleEntries.map(([host, category]) => (
                  <span key={host} className="flex items-center gap-1 text-[11px] rounded-md pl-2 pr-1 py-0.5"
                    style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                    {host} → <strong>{category}</strong>
                    <button type="button" onClick={() => removeRule(host)} title={`Remove rule for ${host}`}
                      className="h-4 w-4 flex items-center justify-center rounded hover:text-red-400">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg p-2.5 text-xs"
              style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", color: "#f87171" }}>
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 shrink-0 pt-2">
          {rows.length > 0 ? (
            <label className="flex items-center gap-2 text-[11px] cursor-pointer select-none" style={{ color: "var(--app-text-muted)" }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember for future bookmarks from these sites
            </label>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} style={{ color: "var(--app-text-muted)" }}>
              {rows.length ? "Cancel" : "Close"}
            </Button>
            {rows.length > 0 && (
              <Button type="button" onClick={apply} disabled={applying || selected.length === 0}
                style={{ background: "var(--app-cta-bg)", color: "var(--app-cta-text)" }}>
                {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Move {selected.length} bookmark{selected.length === 1 ? "" : "s"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
