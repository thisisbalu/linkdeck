"use client";

import { useId, useState } from "react";
import { FolderInput, Pin, PinOff, Trash2, X } from "lucide-react";

interface BulkActionBarProps {
  count: number;
  total: number;
  categories: string[];
  onSelectAll: () => void;
  onClear: () => void;
  onPin: (pinned: boolean) => void;
  onMove: (category: string) => void;
  onDelete: () => void;
  onDone: () => void;
}

const btn = "flex items-center gap-1.5 h-7 px-2 rounded-md text-xs transition-colors hover:bg-[rgba(128,128,128,0.15)] disabled:opacity-40 disabled:pointer-events-none";

export function BulkActionBar({ count, total, categories, onSelectAll, onClear, onPin, onMove, onDelete, onDone }: BulkActionBarProps) {
  const listId = useId();
  const [moving, setMoving] = useState(false);
  const [category, setCategory] = useState("");
  const none = count === 0;

  function submitMove(e: React.FormEvent) {
    e.preventDefault();
    if (!category.trim()) return;
    onMove(category.trim());
    setMoving(false);
    setCategory("");
  }

  return (
    <div role="toolbar" aria-label="Bulk actions"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-xl pl-3 pr-1.5 py-1.5 shadow-xl max-w-[95vw] flex-wrap"
      style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>
      <span className="text-xs font-semibold mr-1 tabular-nums">{count} selected</span>
      <button type="button" className={btn} onClick={count === total ? onClear : onSelectAll} style={{ color: "var(--app-text-muted)" }}>
        {count === total ? "Clear" : `Select all ${total}`}
      </button>
      <span className="w-px h-4 mx-1" style={{ background: "var(--app-border)" }} />

      <button type="button" className={btn} disabled={none} onClick={() => onPin(true)}><Pin className="h-3.5 w-3.5" />Pin</button>
      <button type="button" className={btn} disabled={none} onClick={() => onPin(false)}><PinOff className="h-3.5 w-3.5" />Unpin</button>

      {moving ? (
        <form onSubmit={submitMove} className="flex items-center gap-1">
          <input autoFocus list={listId} value={category} onChange={(e) => setCategory(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setMoving(false); } }}
            placeholder="Category" aria-label="Move to category"
            className="h-7 w-36 rounded-md px-2 text-xs focus:outline-none focus:ring-1"
            style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }} />
          <datalist id={listId}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <button type="submit" className={btn} disabled={!category.trim()}>Move</button>
        </form>
      ) : (
        <button type="button" className={btn} disabled={none} onClick={() => setMoving(true)}>
          <FolderInput className="h-3.5 w-3.5" />Move to…
        </button>
      )}

      <button type="button" className={`${btn} hover:text-red-400`} disabled={none} onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />Delete
      </button>
      <span className="w-px h-4 mx-1" style={{ background: "var(--app-border)" }} />
      <button type="button" className={btn} onClick={onDone} title="Exit selection (Esc)">
        <X className="h-3.5 w-3.5" />Done
      </button>
    </div>
  );
}
