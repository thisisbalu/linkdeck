"use client";

import { useState, useCallback } from "react";
import { Pin, Pencil } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LinkStatusIcon, SelectionMark, useBookmarkView } from "@/components/BookmarkViewContext";
import type { Bookmark } from "@/lib/types";

interface PinnedStripProps {
  bookmarks: Bookmark[];
  onPin: (id: string, pinned: boolean) => void;
  onEdit: (id: string) => void;
  onReorder: (updated: Bookmark[]) => void;
}

function FaviconFallback({ url }: { url: string }) {
  let letter = "?";
  try { letter = new URL(url).hostname.replace("www.", "")[0].toUpperCase(); } catch { /* ignore */ }
  return (
    <div className="w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[9px] font-bold shrink-0"
      style={{ background: "var(--app-border)", color: "var(--app-text-muted)" }}>
      {letter}
    </div>
  );
}

function PinnedChipInner({ bookmark, onPin, onEdit, isDragOverlay = false }: {
  bookmark: Bookmark;
  onPin: (id: string, pinned: boolean) => void;
  onEdit?: (id: string) => void;
  isDragOverlay?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const view = useBookmarkView();
  const selected = view.selecting && view.isSelected(bookmark.id);

  return (
    <div className="group relative">
    <button
      aria-selected={view.selecting ? selected : undefined}
      onClick={() => {
        if (isDragOverlay) return;
        if (view.selecting) view.toggleSelected(bookmark.id);
        else view.openBookmark(bookmark);
      }}
      onContextMenu={(e) => { e.preventDefault(); onPin(bookmark.id, false); }}
      title={`${bookmark.title}\nRight-click to unpin`}
      className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all duration-150 max-w-[160px]"
      style={{
        background: "var(--app-surface)",
        border: `1px solid ${selected ? "var(--app-text-faint)" : "var(--app-border)"}`,
        color: "var(--app-text-muted)",
        boxShadow: isDragOverlay ? "0 4px 12px rgba(0,0,0,0.3)" : undefined,
      }}
      onMouseEnter={(e) => { if (!isDragOverlay) e.currentTarget.style.borderColor = "var(--app-text-faint)"; }}
      onMouseLeave={(e) => { if (!isDragOverlay) e.currentTarget.style.borderColor = "var(--app-border)"; }}
    >
      {view.selecting && <SelectionMark selected={selected} />}
      {bookmark.favicon && !imgError ? (
        <img src={bookmark.favicon} alt="" width={14} height={14} className="rounded-sm shrink-0"
          onError={() => setImgError(true)} />
      ) : (
        <FaviconFallback url={bookmark.url} />
      )}
      <span className="text-xs truncate leading-none" style={{ color: "var(--app-text-muted)" }}>
        {bookmark.title}
      </span>
      <LinkStatusIcon id={bookmark.id} size={11} />
    </button>
    {onEdit && !isDragOverlay && !view.selecting && (
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(bookmark.id); }}
        title="Edit"
        className="absolute -top-1.5 -right-1.5 h-4 w-4 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}
      >
        <Pencil className="h-2 w-2" />
      </button>
    )}
    </div>
  );
}

function SortablePinnedChip({ bookmark, onPin, onEdit }: {
  bookmark: Bookmark;
  onPin: (id: string, pinned: boolean) => void;
  onEdit: (id: string) => void;
}) {
  const { dragEnabled } = useBookmarkView();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bookmark.id, disabled: !dragEnabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    cursor: isDragging ? "grabbing" : "pointer",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(dragEnabled ? attributes : {})}
      {...(dragEnabled ? listeners : {})}
      className="touch-none"
    >
      <PinnedChipInner bookmark={bookmark} onPin={onPin} onEdit={onEdit} />
    </div>
  );
}

export function PinnedStrip({ bookmarks, onPin, onEdit, onReorder }: PinnedStripProps) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || active.id === over.id) return;

    const oldIdx = bookmarks.findIndex((b) => b.id === active.id);
    const newIdx = bookmarks.findIndex((b) => b.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = arrayMove(bookmarks, oldIdx, newIdx);
    // Assign sortOrder within pinned group (use negative numbers to float above non-pinned)
    const updated = reordered.map((b, i) => ({ ...b, sortOrder: i * 10 }));
    // Merge back into full bookmark list with updated sort orders
    onReorder(updated);
  }, [bookmarks, onReorder]);

  const activeDrag = activeDragId ? bookmarks.find((b) => b.id === activeDragId) ?? null : null;

  if (bookmarks.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Pin className="h-3 w-3 fill-current text-amber-400" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/70">
          Pinned
        </span>
      </div>

      <DndContext
        id="pinned-strip"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={bookmarks.map((b) => b.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex flex-wrap gap-2">
            {bookmarks.map((b) => (
              <SortablePinnedChip key={b.id} bookmark={b} onPin={onPin} onEdit={onEdit} />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={{ duration: 120, easing: "ease" }}>
          {activeDrag && <PinnedChipInner bookmark={activeDrag} onPin={onPin} isDragOverlay />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
