"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, Pin, PinOff } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BookmarkChip } from "@/components/BookmarkChip";
import { BookmarkRow } from "@/components/BookmarkRow";
import { getCategoryColor } from "@/lib/category-colors";
import { useTheme } from "@/components/ThemeProvider";
import { useBookmarkView } from "@/components/BookmarkViewContext";
import type { Bookmark } from "@/lib/types";

const DEFAULT_VISIBLE = 6;
const STORAGE_KEY = "pinned-categories";

function loadPinnedCategories(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function savePinnedCategories(cats: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(cats))); } catch { /* ignore */ }
}

// ── Sortable chip wrapper — whole row is the drag handle ──────────────────────
function SortableChip({
  bookmark, onPin, onDelete, onRename, onEdit,
}: {
  bookmark: Bookmark;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onEdit: (id: string) => void;
}) {
  const { dragEnabled } = useBookmarkView();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bookmark.id, disabled: !dragEnabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    // Pointer normally; grabbing while actively dragging
    cursor: isDragging ? "grabbing" : "pointer",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      // Spread drag listeners on the whole wrapper so click-and-hold activates drag
      {...(dragEnabled ? attributes : {})}
      {...(dragEnabled ? listeners : {})}
      className="touch-none"
    >
      <BookmarkChip bookmark={bookmark} onPin={onPin} onDelete={onDelete} onRename={onRename} onEdit={onEdit} />
    </div>
  );
}

// ── Droppable + sortable category card ────────────────────────────────────────
function CategoryCard({
  category, bookmarks, hasPinnedBookmark, isCategoryPinned,
  onToggleCategoryPin, onPin, onDelete, onRename, onEdit,
}: {
  category: string; bookmarks: Bookmark[];
  hasPinnedBookmark: boolean; isCategoryPinned: boolean;
  onToggleCategoryPin: (c: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onEdit: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [headerHovered, setHeaderHovered] = useState(false);
  const { theme } = useTheme();
  const colors = getCategoryColor(category);
  const total = bookmarks.length;
  const visible = expanded ? bookmarks : bookmarks.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = total - DEFAULT_VISIBLE;

  // Make the whole card a drop target for cross-category drops
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `cat::${category}` });

  const cardClass = theme === "light"
    ? `rounded-xl overflow-hidden flex flex-col border bg-white ${isOver ? "border-blue-400" : "border-[#e8eaed]"}`
    : hasPinnedBookmark
    ? `rounded-xl overflow-hidden flex flex-col border ${isOver ? "border-blue-500/60" : "border-zinc-700/80"} bg-zinc-900/70`
    : `rounded-xl overflow-hidden flex flex-col border ${isOver ? "border-blue-500/60" : "border-zinc-800/60"} bg-zinc-900/50`;

  const headBorderClass = theme === "light"
    ? "border-b border-[#e8eaed]"
    : hasPinnedBookmark ? "border-b border-zinc-700/60" : "border-b border-zinc-800/40";

  const headTextClass = theme === "light" ? "text-[#5f6368]" : "text-zinc-400";

  return (
    <div className={`ld-card ${cardClass}`} ref={setDropRef} style={{ transition: "border-color 0.15s" }}>
      {/* Header */}
      <div
        className={`flex items-center gap-2 px-3 py-2.5 ${headBorderClass}`}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
      >
        <div className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
        <span className={`text-[11px] font-semibold uppercase tracking-wider flex-1 truncate ${headTextClass}`}>
          {category}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCategoryPin(category); }}
          title={isCategoryPinned ? "Unpin category" : "Pin category to top"}
          className="flex items-center justify-center h-5 w-5 rounded transition-all shrink-0"
          style={{
            opacity: isCategoryPinned ? 1 : headerHovered ? 1 : 0,
            color: isCategoryPinned ? "#f59e0b" : "var(--app-text-faint)",
          }}
        >
          {isCategoryPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
        </button>
      </div>

      {/* Sortable bookmark list */}
      <div className="flex flex-col gap-0.5 p-2">
        <SortableContext items={visible.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {visible.map((b) => (
            <SortableChip key={b.id} bookmark={b} onPin={onPin} onDelete={onDelete} onRename={onRename} onEdit={onEdit} />
          ))}
        </SortableContext>
        {/* Empty-category drop zone */}
        {total === 0 && (
          <div className="h-8 rounded-lg flex items-center justify-center text-[11px]"
            style={{ border: "1px dashed var(--app-border)", color: "var(--app-text-faint)" }}>
            Drop here
          </div>
        )}
      </div>

      {/* Expand / collapse */}
      {total > DEFAULT_VISIBLE && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 text-[11px] transition-colors mt-auto"
          style={{ color: "var(--app-text-faint)", borderTop: "1px solid var(--app-border-soft)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--app-text-muted)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--app-text-faint)")}
        >
          {expanded
            ? <><ChevronDown className="h-3 w-3" />Show less</>
            : <><ChevronRight className="h-3 w-3" />+{hiddenCount} more</>}
        </button>
      )}
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
      {[5, 3, 7, 2, 4, 6].map((chipCount, i) => (
        <div key={i} className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)" }}>
          <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--app-border)" }} />
            <div className="h-2.5 w-16 rounded animate-pulse" style={{ background: "var(--app-border)" }} />
          </div>
          <div className="flex flex-col gap-0.5 p-2">
            {Array.from({ length: Math.min(chipCount, DEFAULT_VISIBLE) }).map((_, j) => (
              <div key={j} className="h-7 w-full rounded-lg animate-pulse" style={{ background: "var(--app-border)" }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Search results ────────────────────────────────────────────────────────────
function SearchResults({ bookmarks, query, onPin, onDelete, onRename, onEdit, selectedId }: {
  bookmarks: Bookmark[]; query: string; selectedId?: string;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onEdit: (id: string) => void;
}) {
  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-4xl mb-3 opacity-30 select-none">🔍</div>
        <p className="text-sm font-medium" style={{ color: "var(--app-text-muted)" }}>No bookmarks match &quot;{query}&quot;</p>
        <p className="text-xs mt-1" style={{ color: "var(--app-text-faint)" }}>Try a different search term</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <p className="text-xs mb-3 px-1 flex justify-between gap-3" style={{ color: "var(--app-text-faint)" }}>
        <span>{bookmarks.length} result{bookmarks.length !== 1 ? "s" : ""}</span>
        <span className="hidden sm:inline">↑↓ select · ↵ open · ⌘↵ new tab · esc close</span>
      </p>
      <div className="relative">
        {bookmarks.map((b) => <BookmarkRow key={b.id} bookmark={b} onPin={onPin} onDelete={onDelete} onRename={onRename} onEdit={onEdit} selected={b.id === selectedId} />)}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function BookmarkGroupedList({
  bookmarks, loading, searchQuery, onPin, onDelete, onRename, onEdit, onReorder, selectedId,
}: {
  bookmarks: Bookmark[]; loading: boolean; searchQuery: string; selectedId?: string;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onEdit: (id: string) => void;
  onReorder: (updated: Bookmark[]) => void;
}) {
  const { compare } = useBookmarkView();
  const [pinnedCategories, setPinnedCategories] = useState<Set<string>>(new Set());
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overCategory, setOverCategory] = useState<string | null>(null);

  useEffect(() => { setPinnedCategories(loadPinnedCategories()); }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  );

  const toggleCategoryPin = (category: string) => {
    setPinnedCategories((prev) => {
      const next = new Set(prev);
      next.has(category) ? next.delete(category) : next.add(category);
      savePinnedCategories(next);
      return next;
    });
  };

  const { groups, categoriesWithPinnedBookmarks } = useMemo(() => {
    const map = new Map<string, Bookmark[]>();
    const withPinnedBookmark = new Set<string>();
    for (const b of bookmarks) {
      if (!map.has(b.category)) map.set(b.category, []);
      map.get(b.category)!.push(b);
      if (b.pinned) withPinnedBookmark.add(b.category);
    }
    // Sort within each category by the current sort mode
    map.forEach((items, cat) => {
      map.set(cat, [...items].sort(compare));
    });
    const sorted = Array.from(map.entries()).sort(([catA, bmsA], [catB, bmsB]) => {
      const aScore = (pinnedCategories.has(catA) ? 2 : 0) + (withPinnedBookmark.has(catA) ? 1 : 0);
      const bScore = (pinnedCategories.has(catB) ? 2 : 0) + (withPinnedBookmark.has(catB) ? 1 : 0);
      if (aScore !== bScore) return bScore - aScore;
      return bmsB.length - bmsA.length;
    });
    return { groups: sorted, categoriesWithPinnedBookmarks: withPinnedBookmark };
  }, [bookmarks, pinnedCategories, compare]);

  // Build a flat id→category lookup for quick access during drag events
  const idToCategory = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bookmarks) m.set(b.id, b.category);
    return m;
  }, [bookmarks]);

  const activeDragBookmark = useMemo(
    () => activeDragId ? bookmarks.find((b) => b.id === activeDragId) ?? null : null,
    [activeDragId, bookmarks]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = String(event.over?.id ?? "");
    // over a category droppable zone (cat::Category) or over another chip
    if (overId.startsWith("cat::")) {
      setOverCategory(overId.slice(5));
    } else if (overId) {
      setOverCategory(idToCategory.get(overId) ?? null);
    } else {
      setOverCategory(null);
    }
  }, [idToCategory]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    setOverCategory(null);

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const sourceCategory = idToCategory.get(activeId);
    if (!sourceCategory) return;

    // Determine target category
    let targetCategory: string;
    if (overId.startsWith("cat::")) {
      targetCategory = overId.slice(5);
    } else {
      targetCategory = idToCategory.get(overId) ?? sourceCategory;
    }

    if (sourceCategory === targetCategory) {
      // ── Same-category reorder ──────────────────────────────────────────────
      if (activeId === overId) return;
      const catItems = groups.find(([c]) => c === sourceCategory)?.[1] ?? [];
      const oldIdx = catItems.findIndex((b) => b.id === activeId);
      const newIdx = catItems.findIndex((b) => b.id === overId);
      if (oldIdx === -1 || newIdx === -1) return;

      const reordered = arrayMove(catItems, oldIdx, newIdx);
      // Assign new sortOrders: multiply by 10 so there's room for future inserts
      const updated = bookmarks.map((b) => {
        const newPos = reordered.findIndex((r) => r.id === b.id);
        if (newPos === -1) return b;
        return { ...b, sortOrder: newPos * 10 };
      });
      onReorder(updated);
    } else {
      // ── Cross-category move ────────────────────────────────────────────────
      const targetItems = groups.find(([c]) => c === targetCategory)?.[1] ?? [];
      const insertAfterIdx = overId.startsWith("cat::") ? targetItems.length - 1 : targetItems.findIndex((b) => b.id === overId);
      const insertPos = insertAfterIdx === -1 ? 0 : insertAfterIdx + 1;

      // Rebuild sortOrders for destination category with the dragged item inserted
      const newTargetOrder = [...targetItems];
      newTargetOrder.splice(insertPos, 0, { ...bookmarks.find((b) => b.id === activeId)!, category: targetCategory });

      const updated = bookmarks.map((b) => {
        if (b.id === activeId) {
          const pos = newTargetOrder.findIndex((r) => r.id === activeId);
          return { ...b, category: targetCategory, sortOrder: pos * 10 };
        }
        const pos = newTargetOrder.findIndex((r) => r.id === b.id);
        if (pos !== -1) return { ...b, sortOrder: pos * 10 };
        return b;
      });
      onReorder(updated);
    }
  }, [bookmarks, groups, idToCategory, onReorder]);

  if (loading) return <LoadingSkeleton />;

  if (bookmarks.length === 0 && !searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-5xl mb-4 select-none opacity-30">🔖</div>
        <p className="text-sm font-medium" style={{ color: "var(--app-text-muted)" }}>No bookmarks yet</p>
        <p className="text-xs mt-1" style={{ color: "var(--app-text-faint)" }}>Add your first bookmark using the button above</p>
      </div>
    );
  }

  if (searchQuery.trim()) {
    return <SearchResults bookmarks={bookmarks} query={searchQuery} onPin={onPin} onDelete={onDelete} onRename={onRename} onEdit={onEdit} selectedId={selectedId} />;
  }

  return (
    <DndContext
      id="bookmark-grid"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
        {groups.map(([category, items]) => (
          <CategoryCard
            key={category}
            category={category}
            bookmarks={items}
            hasPinnedBookmark={categoriesWithPinnedBookmarks.has(category)}
            isCategoryPinned={pinnedCategories.has(category)}
            onToggleCategoryPin={toggleCategoryPin}
            onPin={onPin}
            onDelete={onDelete}
            onRename={onRename}
            onEdit={onEdit}
          />
        ))}
      </div>

      {/* Ghost chip shown while dragging */}
      <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
        {activeDragBookmark && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg shadow-xl text-xs w-56"
            style={{
              background: "var(--app-surface2)",
              border: "1px solid var(--app-border)",
              color: "var(--app-text-muted)",
              opacity: 0.95,
            }}>
            {activeDragBookmark.favicon && (
              <img src={activeDragBookmark.favicon} alt="" width={14} height={14} className="rounded-sm shrink-0" />
            )}
            <span className="truncate flex-1">{activeDragBookmark.title}</span>
            {overCategory && overCategory !== idToCategory.get(activeDragBookmark.id) && (
              <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                style={{ background: "var(--app-border)", color: "var(--app-text-faint)" }}>
                → {overCategory}
              </span>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
