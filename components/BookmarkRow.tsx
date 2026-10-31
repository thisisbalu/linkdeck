"use client";

import { useState, useRef, useEffect } from "react";
import { Pin, PinOff, Trash2, Pencil } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LinkStatusIcon, SelectionMark, useBookmarkView } from "@/components/BookmarkViewContext";
import type { Bookmark } from "@/lib/types";

interface BookmarkRowProps {
  bookmark: Bookmark;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onEdit: (id: string) => void;
  /** Highlighted by keyboard navigation in search results. */
  selected?: boolean;
  /** Shown before the icon (e.g. a rank number). */
  leading?: React.ReactNode;
  /** Replaces the site name on the right (e.g. a visit count or time). */
  meta?: React.ReactNode;
  /** Search results open in a new tab; usage lists open in place like the grid. */
  openInNewTab?: boolean;
}

function FaviconFallback({ url }: { url: string }) {
  let letter = "?";
  try { letter = new URL(url).hostname.replace("www.", "")[0].toUpperCase(); } catch { /* ignore */ }
  return (
    <div className="w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold shrink-0"
      style={{ background: "var(--app-border)", color: "var(--app-text-muted)" }}>
      {letter}
    </div>
  );
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

export function BookmarkRow({
  bookmark, onPin, onDelete, onRename, onEdit, selected = false, leading, meta, openInNewTab = true,
}: BookmarkRowProps) {
  const [imgError, setImgError] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bookmark.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const view = useBookmarkView();
  const checked = view.selecting && view.isSelected(bookmark.id);

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    if (editing) {
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 10);
    }
  }, [editing]);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    if (view.selecting) return;
    setDraft(bookmark.title);
    setEditing(true);
  }

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== bookmark.title) onRename(bookmark.id, trimmed);
    setEditing(false);
  }

  function cancelEdit() {
    setDraft(bookmark.title);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  }

  function handleRowClick(e: React.MouseEvent) {
    if (editing) return;
    if ((e.target as HTMLElement).closest("button, input")) return;
    if (view.selecting) view.toggleSelected(bookmark.id);
    else view.openBookmark(bookmark, { newTab: openInNewTab });
  }

  return (
    <TooltipProvider delayDuration={editing ? 99999 : 300}>
      <div
        ref={rowRef}
        aria-selected={selected}
        className="group relative flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-colors"
        style={{
          background: hovered || selected || checked ? "var(--app-surface2)" : "transparent",
          boxShadow: selected ? "inset 2px 0 0 var(--app-text-muted)" : undefined,
          cursor: editing ? "default" : "pointer",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleRowClick}
      >
        {leading}
        {view.selecting && <SelectionMark selected={checked} />}
        {bookmark.favicon && !imgError ? (
          <img src={bookmark.favicon} alt="" width={14} height={14} className="rounded-sm shrink-0"
            onError={() => setImgError(true)} />
        ) : (
          <FaviconFallback url={bookmark.url} />
        )}

        {/* Title — normal or inline edit */}
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitEdit}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 text-sm bg-transparent focus:outline-none"
            style={{ color: "var(--app-text)" }}
          />
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="flex-1 min-w-0 text-sm truncate leading-none"
                style={{ color: "var(--app-text)" }}
                onDoubleClick={startEdit}
              >
                {bookmark.title}
                {bookmark.pinned && <Pin className="inline ml-1.5 h-2.5 w-2.5 fill-current text-amber-400/70 -translate-y-px" />}
              </span>
            </TooltipTrigger>
            {bookmark.description && (
              <TooltipContent side="top" className="max-w-xs text-xs"
                style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>
                {bookmark.description}
              </TooltipContent>
            )}
          </Tooltip>
        )}

        {!editing && <LinkStatusIcon id={bookmark.id} />}

        {!editing && (
          <>
            <span className="text-[11px] shrink-0 transition-opacity duration-100"
              style={{ color: "var(--app-text-faint)", opacity: hovered ? 0 : 1 }}>
              {meta ?? getDomain(bookmark.url)}
            </span>
            <div className={`flex items-center gap-0.5 shrink-0 transition-opacity duration-100 absolute right-3 ${hovered && !view.selecting ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={(e) => { e.stopPropagation(); onEdit(bookmark.id); }} className="h-6 w-6 flex items-center justify-center rounded transition-colors" style={{ color: "var(--app-text-faint)" }}>
                    <Pencil className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs" style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>Edit</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={(e) => { e.stopPropagation(); onPin(bookmark.id, !bookmark.pinned); }} className="h-6 w-6 flex items-center justify-center rounded transition-colors" style={{ color: "var(--app-text-faint)" }}>
                    {bookmark.pinned ? <Pin className="h-3 w-3 fill-current text-amber-400" /> : <PinOff className="h-3 w-3" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs" style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>{bookmark.pinned ? "Unpin" : "Pin to top"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(bookmark.id); }} className="h-6 w-6 flex items-center justify-center rounded transition-colors hover:text-red-400" style={{ color: "var(--app-text-faint)" }}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs" style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>Delete</TooltipContent>
              </Tooltip>
            </div>
          </>
        )}

        {editing && (
          <span className="text-[9px] shrink-0" style={{ color: "var(--app-text-faint)" }}>↵ save · esc cancel</span>
        )}
      </div>
    </TooltipProvider>
  );
}
