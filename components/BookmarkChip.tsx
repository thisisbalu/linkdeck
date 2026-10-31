"use client";

import { Pin, PinOff, Trash2, Pencil } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/ThemeProvider";
import { LinkStatusIcon, SelectionMark, useBookmarkView } from "@/components/BookmarkViewContext";
import type { Bookmark } from "@/lib/types";
import { useState, useRef, useEffect } from "react";

interface BookmarkChipProps {
  bookmark: Bookmark;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onEdit: (id: string) => void;
}

function getFileTypeIcon(bookmark: { title: string; url: string; category: string }): string | null {
  const text = `${bookmark.title} ${bookmark.url}`.toLowerCase();
  if (bookmark.category === "Sheets" || /\.(xlsx|xls|csv)/.test(text)) return "📊";
  if (bookmark.category === "Slides" || /\.(pptx|ppt|key)/.test(text)) return "📑";
  if (bookmark.category === "Documents" || /\.(docx|doc|pdf)/.test(text)) return "📄";
  return null;
}

function FaviconFallback({ url }: { url: string }) {
  let letter = "?";
  try { letter = new URL(url).hostname.replace("www.", "")[0].toUpperCase(); } catch { /* ignore */ }
  return (
    <div className="w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[8px] font-bold shrink-0"
      style={{ background: "var(--app-border)", color: "var(--app-text-muted)" }}>
      {letter}
    </div>
  );
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

export function BookmarkChip({ bookmark, onPin, onDelete, onRename, onEdit }: BookmarkChipProps) {
  const [imgError, setImgError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bookmark.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const { theme } = useTheme();
  const view = useBookmarkView();
  const selected = view.selecting && view.isSelected(bookmark.id);
  const fileTypeIcon = getFileTypeIcon(bookmark);

  const tooltipContent = [bookmark.description, getDomain(bookmark.url)].filter(Boolean).join(" · ");

  // Focus & select all when edit mode opens
  useEffect(() => {
    if (editing) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 10);
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
    if (trimmed && trimmed !== bookmark.title) {
      onRename(bookmark.id, trimmed);
    }
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

  function handleClick(e: React.MouseEvent) {
    if (editing) return;
    if ((e.target as HTMLElement).closest("button, input")) return;
    if (view.selecting) view.toggleSelected(bookmark.id);
    else view.openBookmark(bookmark);
  }

  const rowBase  = theme === "light" ? `#ffffff`  : `rgba(24,24,27,0.8)`;
  const rowHover = theme === "light" ? `#f1f3f4`  : `rgba(39,39,42,0.9)`;
  const editBg   = theme === "light" ? `#ffffff`  : `#27272a`;

  return (
    <TooltipProvider delayDuration={editing ? 99999 : 400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="group relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors duration-150 w-full"
            aria-selected={view.selecting ? selected : undefined}
            style={{
              background: editing ? editBg : selected ? rowHover : rowBase,
              border: editing || selected
                ? "1px solid var(--app-text-faint)"
                : "1px solid var(--app-border-soft)",
              cursor: editing ? "default" : "pointer",
            }}
            onMouseEnter={(e) => { if (!editing) e.currentTarget.style.background = rowHover; }}
            onMouseLeave={(e) => { if (!editing && !selected) e.currentTarget.style.background = rowBase; }}
            onClick={handleClick}
          >
            {view.selecting && <SelectionMark selected={selected} />}

            {/* Favicon / file type icon */}
            <div className="shrink-0">
              {fileTypeIcon ? (
                <span className="text-[13px] leading-none">{fileTypeIcon}</span>
              ) : bookmark.favicon && !imgError ? (
                <img src={bookmark.favicon} alt="" width={14} height={14} className="rounded-sm"
                  onError={() => setImgError(true)} />
              ) : (
                <FaviconFallback url={bookmark.url} />
              )}
            </div>

            {/* Title — normal or inline edit */}
            {editing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={commitEdit}
                className="flex-1 min-w-0 text-xs bg-transparent focus:outline-none"
                style={{ color: "var(--app-text)" }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className="flex-1 min-w-0 text-xs truncate leading-snug select-none"
                style={{ color: "var(--app-text-muted)" }}
                onDoubleClick={startEdit}
              >
                {bookmark.title}
              </span>
            )}

            {!editing && <LinkStatusIcon id={bookmark.id} />}

            {/* Pinned dot — hidden while editing */}
            {!editing && bookmark.pinned && (
              <Pin className="h-2.5 w-2.5 fill-current text-amber-400/70 shrink-0" />
            )}

            {/* Action buttons — hidden while editing or selecting */}
            {!editing && !view.selecting && (
              <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(bookmark.id); }}
                  className="h-5 w-5 flex items-center justify-center rounded transition-colors"
                  style={{ color: "var(--app-text-faint)" }}
                  title="Edit"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onPin(bookmark.id, !bookmark.pinned); }}
                  className="h-5 w-5 flex items-center justify-center rounded transition-colors"
                  style={{ color: "var(--app-text-faint)" }}
                  title={bookmark.pinned ? "Unpin" : "Pin"}
                >
                  {bookmark.pinned
                    ? <Pin className="h-2.5 w-2.5 fill-current text-amber-400" />
                    : <PinOff className="h-2.5 w-2.5" />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(bookmark.id); }}
                  className="h-5 w-5 flex items-center justify-center rounded transition-colors hover:text-red-400"
                  style={{ color: "var(--app-text-faint)" }}
                  title="Delete"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            )}

            {/* Editing hint */}
            {editing && (
              <span className="text-[9px] shrink-0" style={{ color: "var(--app-text-faint)" }}>
                ↵ save · esc cancel
              </span>
            )}
          </div>
        </TooltipTrigger>
        {!editing && tooltipContent && (
          <TooltipContent side="top" className="max-w-xs text-xs"
            style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>
            {tooltipContent}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
