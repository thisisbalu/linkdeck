"use client";

import { Suspense, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Plus, Search, X, Upload, WandSparkles, Ellipsis, ListChecks, Link2Off, Download, ArchiveRestore, Command, Sun, Moon, HardDrive, Palette } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { BACKGROUNDS, type BackgroundId } from "@/lib/backgrounds";
import { BookmarkGroupedList } from "@/components/BookmarkGroupedList";
import { PinnedStrip } from "@/components/PinnedStrip";
import { AddBookmarkDialog } from "@/components/AddBookmarkDialog";
import { ImportBookmarksDialog } from "@/components/ImportBookmarksDialog";
import { EditBookmarkDialog } from "@/components/EditBookmarkDialog";
import { TidyCategoriesDialog } from "@/components/TidyCategoriesDialog";
import { UndoToast } from "@/components/UndoToast";
import { LinkCheckDialog } from "@/components/LinkCheckDialog";
import { BulkActionBar } from "@/components/BulkActionBar";
import { BackupsDialog } from "@/components/BackupsDialog";
import { UsageView } from "@/components/UsageView";
import { BookmarkViewContext, type BookmarkView } from "@/components/BookmarkViewContext";
import { useBookmarkRefreshKey } from "@/components/AppShell";
import { openBookmarkInPlace, recordVisit } from "@/lib/navigation";
import { OPEN_BACKUPS_EVENT, OPEN_COMMAND_PALETTE_EVENT, OPEN_LINK_CHECK_EVENT, OPEN_STORAGE_EVENT, OPEN_TIDY_EVENT } from "@/lib/events";
import { StorageDialog } from "@/components/StorageDialog";
import { StorageBanner } from "@/components/StorageBanner";
import type { StorageStatus } from "@/lib/storage";
import { searchBookmarks, SEARCH_HELP } from "@/lib/search";
import { comparatorFor, manualCompare, SORT_MODES, type SortMode } from "@/lib/sort";
import type { LinkStatus } from "@/lib/link-check";
import type { Bookmark } from "@/lib/types";

const UNDO_MS = 6000;
const SORT_KEY = "bookmark-sort-mode";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

function anyDialogOpen(): boolean {
  return document.querySelector('[role="dialog"]') !== null;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

interface HomeClientProps { initialBookmarks: Bookmark[]; initialStorageError?: string | null; }

/** Bookmarks from the API, or null when the server couldn't read them (e.g. storage folder unavailable). */
async function fetchBookmarkList(): Promise<Bookmark[] | null> {
  const res = await fetch("/api/bookmarks");
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data : null;
}

function HomeInner({ initialBookmarks, initialStorageError = null }: HomeClientProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(initialBookmarks);
  const [loading, setLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [tidyOpen, setTidyOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const { theme, background, setBackground, timeTint, setTimeTint } = useTheme();
  const backgroundOptions = BACKGROUNDS[theme];
  const currentSwatch = backgroundOptions.find((b) => b.id === background)?.swatch;
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [linkCheckOpen, setLinkCheckOpen] = useState(false);
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [usageSyncedAt, setUsageSyncedAt] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<Record<string, LinkStatus>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(SORT_KEY) as SortMode | null;
    if (saved && SORT_MODES.some((m) => m.id === saved)) setSortMode(saved);
    fetch("/api/links").then((r) => r.json()).then((d) => setLinkStatus(d.statuses ?? {})).catch(() => {});
  }, []);

  function changeSortMode(mode: SortMode) {
    setSortMode(mode);
    try { localStorage.setItem(SORT_KEY, mode); } catch { /* ignore */ }
  }

  // Deleted bookmarks are hidden immediately but only removed on the server
  // after UNDO_MS (or right away when the page is closed / another delete happens).
  const pendingDeleteRef = useRef<{ bookmarks: Bookmark[]; timer: ReturnType<typeof setTimeout> } | null>(null);
  const withoutPending = useCallback((list: Bookmark[]) => {
    const pending = pendingDeleteRef.current;
    if (!pending) return list;
    const ids = new Set(pending.bookmarks.map((b) => b.id));
    return list.filter((b) => !ids.has(b.id));
  }, []);

  const externalRefreshKey = useBookmarkRefreshKey();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setLoading(true);
    fetchBookmarkList()
      .then((data) => { if (data) setBookmarks(withoutPending(data)); else refreshStorage(); })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalRefreshKey]);

  useEffect(() => {
    const openTidy = () => setTidyOpen(true);
    const openLinks = () => setLinkCheckOpen(true);
    const openBackups = () => setBackupsOpen(true);
    window.addEventListener(OPEN_TIDY_EVENT, openTidy);
    window.addEventListener(OPEN_LINK_CHECK_EVENT, openLinks);
    window.addEventListener(OPEN_BACKUPS_EVENT, openBackups);
    const openStorage = () => setStorageOpen(true);
    window.addEventListener(OPEN_STORAGE_EVENT, openStorage);
    return () => {
      window.removeEventListener(OPEN_TIDY_EVENT, openTidy);
      window.removeEventListener(OPEN_LINK_CHECK_EVENT, openLinks);
      window.removeEventListener(OPEN_BACKUPS_EVENT, openBackups);
      window.removeEventListener(OPEN_STORAGE_EVENT, openStorage);
    };
  }, []);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [searchOpen]);

  function closeSearch() { setSearchOpen(false); setSearchQuery(""); }

  useEffect(() => { setSelectedIndex(0); }, [searchQuery]);

  const compare = useMemo(() => comparatorFor(sortMode), [sortMode]);
  const sorted = useMemo(() => [...bookmarks].sort(compare), [bookmarks, compare]);

  // Pinned bookmarks always keep your hand-arranged order, whatever the sort mode.
  const pinned = useMemo(() => bookmarks.filter((b) => b.pinned).sort(manualCompare), [bookmarks]);

  const categories = useMemo(
    () => Array.from(new Set(bookmarks.map((b) => b.category))).sort((a, b) => a.localeCompare(b)),
    [bookmarks]
  );

  const listBookmarks = useMemo(() => {
    if (!searchQuery.trim()) return sorted.filter((b) => !b.pinned);
    return searchBookmarks(sorted, searchQuery, { linkState: (id) => linkStatus[id]?.state });
  }, [sorted, searchQuery, linkStatus]);

  const handleAdded = useCallback((bookmark: Bookmark) => {
    setBookmarks((prev) => [bookmark, ...prev]);
    setSearchQuery(""); closeSearch();
  }, []);

  const handleImported = useCallback((imported: Bookmark[]) => {
    setBookmarks((prev) => {
      const existingUrls = new Set(prev.map((b) => b.url));
      return [...imported.filter((b) => !existingUrls.has(b.url)), ...prev];
    });
  }, []);

  const refreshUsageStatus = useCallback(() => {
    fetch("/api/usage/status").then((r) => r.json()).then((d) => setUsageSyncedAt(d.syncedAt ?? null)).catch(() => {});
  }, []);
  useEffect(() => { refreshUsageStatus(); }, [refreshUsageStatus]);

  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [storageOpen, setStorageOpen] = useState(false);
  const refreshStorage = useCallback(() => {
    fetch("/api/storage", { cache: "no-store" }).then((r) => r.json()).then(setStorage).catch(() => {});
  }, []);
  useEffect(() => { refreshStorage(); }, [refreshStorage]);

  // If the data folder isn't reachable (e.g. iCloud/Box still starting after
  // login), keep checking and reload by ourselves as soon as it's back.
  const storageDown = storage ? !storage.available : !!initialStorageError;
  useEffect(() => {
    if (!storageDown) return;
    const timer = setInterval(refreshStorage, 5000);
    return () => clearInterval(timer);
  }, [storageDown, refreshStorage]);

  const reloadFromServer = useCallback(() => {
    fetchBookmarkList()
      .then((data) => {
        if (data) setBookmarks(withoutPending(data));
        refreshStorage();
      })
      .catch(() => {});
  }, [withoutPending, refreshStorage]);

  // Nothing loaded because the folder is unavailable — don't claim "no bookmarks".
  const waitingForData = storageDown && bookmarks.length === 0;
  const wasStorageDown = useRef(storageDown);
  useEffect(() => {
    if (wasStorageDown.current && !storageDown) reloadFromServer();
    wasStorageDown.current = storageDown;
  }, [storageDown, reloadFromServer]);

  // Optimistic PATCH: local state is already updated; resync on any failure.
  const patchBookmark = useCallback((id: string, changes: Partial<Bookmark>) => {
    fetch(`/api/bookmarks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    })
      .then((res) => { if (!res.ok) reloadFromServer(); })
      .catch(reloadFromServer);
  }, [reloadFromServer]);

  const handlePin = useCallback((id: string, pinned: boolean) => {
    setBookmarks((prev) => prev.map((b) => (b.id === id ? { ...b, pinned } : b)));
    patchBookmark(id, { pinned });
  }, [patchBookmark]);

  const commitPendingDelete = useCallback((keepalive = false) => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    setUndoMessage(null);
    const ids = pending.bookmarks.map((b) => b.id);
    // keepalive lets the request finish even if the page is being closed.
    const request = ids.length === 1
      ? fetch(`/api/bookmarks/${ids[0]}`, { method: "DELETE", keepalive })
      : fetch("/api/bookmarks/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", ids }),
          keepalive,
        });
    request
      .then((res) => { if (!res.ok) reloadFromServer(); })
      .catch(() => { if (!keepalive) reloadFromServer(); });
  }, [reloadFromServer]);

  const bookmarksRef = useRef(bookmarks);
  bookmarksRef.current = bookmarks;

  const deleteWithUndo = useCallback((ids: string[]) => {
    const wanted = new Set(ids);
    const removed = bookmarksRef.current.filter((b) => wanted.has(b.id));
    if (removed.length === 0) return;
    commitPendingDelete();
    setBookmarks((prev) => prev.filter((b) => !wanted.has(b.id)));
    setSelectedIds((prev) => new Set(Array.from(prev).filter((id) => !wanted.has(id))));
    pendingDeleteRef.current = { bookmarks: removed, timer: setTimeout(() => commitPendingDelete(), UNDO_MS) };
    setUndoMessage(removed.length === 1 ? `Deleted "${removed[0].title}"` : `Deleted ${removed.length} bookmarks`);
  }, [commitPendingDelete]);

  const handleDelete = useCallback((id: string) => deleteWithUndo([id]), [deleteWithUndo]);

  const undoDelete = useCallback(() => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    setUndoMessage(null);
    setBookmarks((prev) => {
      const present = new Set(prev.map((b) => b.id));
      return [...prev, ...pending.bookmarks.filter((b) => !present.has(b.id))];
    });
  }, []);

  useEffect(() => {
    const flush = () => commitPendingDelete(true);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [commitPendingDelete]);

  const handleRename = useCallback((id: string, title: string) => {
    setBookmarks((prev) => prev.map((b) => (b.id === id ? { ...b, title } : b)));
    patchBookmark(id, { title });
  }, [patchBookmark]);

  const handleEdit = useCallback((id: string) => {
    setEditing(bookmarks.find((b) => b.id === id) ?? null);
  }, [bookmarks]);

  const handleEdited = useCallback((updated: Bookmark) => {
    setBookmarks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }, []);

  const handleTidyApplied = useCallback((updated: Bookmark[]) => {
    const byId = new Map(updated.map((b) => [b.id, b]));
    setBookmarks((prev) => prev.map((b) => byId.get(b.id) ?? b));
  }, []);

  const generalCount = useMemo(() => bookmarks.filter((b) => b.category === "General").length, [bookmarks]);

  // ── Opening bookmarks (counts visits for Most used / Recent) ──
  const openBookmark = useCallback((bookmark: Bookmark, options?: { newTab?: boolean }) => {
    recordVisit(bookmark.id);
    const visitedAt = new Date().toISOString();
    setBookmarks((prev) => prev.map((b) =>
      b.id === bookmark.id ? { ...b, visitCount: (b.visitCount ?? 0) + 1, lastVisitedAt: visitedAt } : b));
    if (options?.newTab) window.open(bookmark.url, "_blank", "noopener,noreferrer");
    else openBookmarkInPlace(bookmark.url);
  }, []);

  // ── Selection + bulk actions ──
  const exitSelectMode = useCallback(() => { setSelectMode(false); setSelectedIds(new Set()); }, []);
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const selectableIds = useMemo(
    () => (searchQuery.trim() ? listBookmarks : bookmarks).map((b) => b.id),
    [searchQuery, listBookmarks, bookmarks]
  );

  const runBulk = useCallback((action: "pin" | "unpin" | "move", ids: string[], category?: string) => {
    if (ids.length === 0) return;
    const wanted = new Set(ids);
    setBookmarks((prev) => prev.map((b) => {
      if (!wanted.has(b.id)) return b;
      if (action === "move") return { ...b, category: category! };
      return { ...b, pinned: action === "pin" };
    }));
    fetch("/api/bookmarks/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ids, ...(category ? { category } : {}) }),
    })
      .then((res) => { if (!res.ok) reloadFromServer(); })
      .catch(reloadFromServer);
  }, [reloadFromServer]);

  // After a restore the server data was replaced wholesale: drop any pending
  // (not yet sent) delete so it can't remove something from the restored set.
  const handleRestored = useCallback(() => {
    const pending = pendingDeleteRef.current;
    if (pending) clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    setUndoMessage(null);
    exitSelectMode();
    reloadFromServer();
    refreshUsageStatus();
    fetch("/api/links").then((r) => r.json()).then((d) => setLinkStatus(d.statuses ?? {})).catch(() => {});
  }, [exitSelectMode, reloadFromServer, refreshUsageStatus]);

  const handleLinkStatus = useCallback((id: string, status: LinkStatus) => {
    setLinkStatus((prev) => ({ ...prev, [id]: status }));
  }, []);

  const isSearching = searchQuery.trim().length > 0;
  const selectedId = isSearching ? listBookmarks[selectedIndex]?.id : undefined;

  // Global shortcuts: ⌘F or / search, n add, ⌘Z undo delete, Esc close search.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return;
      }
      if (mod && e.key === "z" && !e.shiftKey && pendingDeleteRef.current && !isTypingTarget(e.target)) {
        e.preventDefault();
        undoDelete();
        return;
      }
      if (e.key === "Escape" && !anyDialogOpen()) {
        if (searchOpen) { setSearchOpen(false); setSearchQuery(""); return; }
        if (selectMode) { exitSelectMode(); return; }
      }
      if (mod || e.altKey || isTypingTarget(e.target) || anyDialogOpen()) return;
      if (e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === "n") {
        e.preventDefault();
        setDialogOpen(true);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [searchOpen, selectMode, exitSelectMode, undoDelete]);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isSearching) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(listBookmarks.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const target = listBookmarks[selectedIndex];
      if (!target) return;
      e.preventDefault();
      if (selectMode) toggleSelected(target.id);
      else openBookmark(target, { newTab: e.metaKey || e.ctrlKey });
    }
  }

  // Debounced persist — avoid hammering the API on every drag tick
  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True from the first drag until the debounced save finishes.
  const reorderPendingRef = useRef(false);

  const handleReorder = useCallback((updated: Bookmark[]) => {
    // Optimistic update: merge new sortOrder/category values into local state
    setBookmarks((prev) => {
      const map = new Map(updated.map((b) => [b.id, b]));
      return prev.map((b) => map.has(b.id) ? { ...b, ...map.get(b.id) } : b);
    });

    // Debounce persist by 400ms. Send each item's sortOrder and category so
    // both in-category reorders and cross-category moves survive a reload.
    if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current);
    reorderPendingRef.current = true;
    reorderTimerRef.current = setTimeout(() => {
      const items = updated
        .filter((b) => typeof b.sortOrder === "number")
        .map((b) => ({ id: b.id, sortOrder: b.sortOrder, category: b.category }));
      fetch("/api/bookmarks/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })
        .then((res) => { if (!res.ok) reloadFromServer(); })
        .catch(reloadFromServer)
        .finally(() => { reorderPendingRef.current = false; });
    }, 400);
  }, [reloadFromServer]);

  // Pick up bookmarks saved elsewhere (extension, right-click, another tab)
  // when you come back to this tab. Skipped while a drag is still being saved
  // so the refresh can't undo it.
  useEffect(() => {
    let lastRefresh = Date.now();
    function refreshIfVisible() {
      if (document.visibilityState !== "visible") return;
      if (reorderPendingRef.current || Date.now() - lastRefresh < 2000) return;
      lastRefresh = Date.now();
      reloadFromServer();
      refreshUsageStatus();
    }
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [reloadFromServer, refreshUsageStatus]);

  // The extension's new tab page tells us when it synced new Chrome-history counts.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (window.parent === window || event.source !== window.parent) return;
      if (!event.origin.startsWith("chrome-extension://")) return;
      if (event.data?.type !== "linkdeck:usage-updated") return;
      reloadFromServer();
      refreshUsageStatus();
    }
    window.addEventListener("message", onMessage);
    // Tell the new tab page we're listening (it may have synced before we loaded).
    if (window.parent !== window) window.parent.postMessage({ type: "linkdeck:ready" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, [reloadFromServer, refreshUsageStatus]);

  const brokenCount = useMemo(
    () => bookmarks.filter((b) => linkStatus[b.id]?.state === "broken").length,
    [bookmarks, linkStatus]
  );

  const view: BookmarkView = useMemo(() => ({
    selecting: selectMode,
    isSelected: (id: string) => selectedIds.has(id),
    toggleSelected,
    linkStatus,
    dragEnabled: sortMode === "manual" && !selectMode,
    compare,
    openBookmark,
  }), [selectMode, selectedIds, toggleSelected, linkStatus, sortMode, compare, openBookmark]);

  return (
    <BookmarkViewContext.Provider value={view}>
    <main style={{ color: "var(--app-text)" }} className={selectMode ? "pb-20" : undefined}>
      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--app-text)" }}>
              {getGreeting()}
            </h1>
            <div className="flex items-center gap-2 text-xs mt-0.5" style={{ color: "var(--app-text-faint)" }}>
              <span>
                {waitingForData ? "Waiting for your data folder…"
                  : bookmarks.length === 0 ? "No bookmarks yet"
                  : `${bookmarks.length} bookmark${bookmarks.length !== 1 ? "s" : ""}`}
              </span>
              {bookmarks.length > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <div role="radiogroup" aria-label="Sort bookmarks" className="flex items-center gap-0.5">
                    {SORT_MODES.map((m) => (
                      <button key={m.id} type="button" role="radio" aria-checked={sortMode === m.id}
                        onClick={() => changeSortMode(m.id)}
                        className="px-1.5 py-0.5 rounded transition-colors"
                        style={{
                          background: sortMode === m.id ? "var(--app-surface2)" : "transparent",
                          color: sortMode === m.id ? "var(--app-text-muted)" : "var(--app-text-faint)",
                        }}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="flex items-center">
              {searchOpen ? (
                <div
                  className="flex items-center gap-1.5 rounded-lg px-2.5 h-8 transition-colors"
                  style={{ background: "var(--app-search-bg)", border: "1px solid var(--app-search-border)" }}
                >
                  <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--app-text-faint)" }} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search… (cat: tag: site: is:)"
                    title={`Filters: ${SEARCH_HELP}`}
                    className="bg-transparent text-sm focus:outline-none w-56"
                    style={{ color: "var(--app-text)" }}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button onClick={closeSearch} className="h-4 w-4 flex items-center justify-center" style={{ color: "var(--app-text-faint)" }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSearchOpen(true)}
                  title="Search ( / or ⌘F )"
                  className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors"
                  style={{ color: "var(--app-text-muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(128,128,128,0.1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Search className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Tidy up categories */}
            <button
              onClick={() => setTidyOpen(true)}
              title={generalCount ? `Tidy up categories (${generalCount} in General)` : "Tidy up categories"}
              className="relative h-8 w-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: "var(--app-text-muted)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(128,128,128,0.1)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <WandSparkles className="h-4 w-4" />
              {generalCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center"
                  style={{ background: "var(--app-cta-bg)", color: "var(--app-cta-text)" }}>
                  {generalCount}
                </span>
              )}
            </button>

            <ThemeToggle />

            {/* More actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  title="More actions"
                  aria-label="More actions"
                  className="relative h-8 w-8 flex items-center justify-center rounded-lg transition-colors"
                  style={{ color: "var(--app-text-muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(128,128,128,0.1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Ellipsis className="h-4 w-4" />
                  {brokenCount > 0 && (
                    <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-red-400" aria-label={`${brokenCount} broken links`} />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56"
                style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>
                <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))}>
                  <Command className="h-4 w-4" /> Command palette
                  <span className="ml-auto text-[10px] tracking-widest" style={{ color: "var(--app-text-faint)" }}>⌘K</span>
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Palette className="h-4 w-4" /> Background
                    <span aria-hidden className="ml-auto h-3 w-3 rounded-full" style={{ background: currentSwatch, border: "1px solid var(--app-border)" }} />
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-52"
                      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>
                      <DropdownMenuRadioGroup value={background} onValueChange={(v) => setBackground(v as BackgroundId)}>
                        {backgroundOptions.map((b) => (
                          // Keep the menu open so styles can be compared quickly.
                          <DropdownMenuRadioItem key={b.id} value={b.id} onSelect={(e) => e.preventDefault()}>
                            <span aria-hidden className="mr-2 h-4 w-4 rounded" style={{ background: b.swatch, border: "1px solid var(--app-border)" }} />
                            {b.label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuCheckboxItem checked={timeTint} onCheckedChange={(c) => setTimeTint(c === true)}
                        onSelect={(e) => e.preventDefault()} disabled={background === "plain"}>
                        <span className="flex flex-col">
                          Match time of day
                          <span className="text-[10px]" style={{ color: "var(--app-text-faint)" }}>warm mornings, cool nights</span>
                        </span>
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => { setSelectMode(true); }}>
                  <ListChecks className="h-4 w-4" /> Select multiple
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setLinkCheckOpen(true)}>
                  <Link2Off className="h-4 w-4" /> Check for dead links
                  {brokenCount > 0 && <span className="ml-auto text-[10px] text-red-400">{brokenCount}</span>}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="/api/bookmarks/export?format=html" download>
                    <Download className="h-4 w-4" /> Export for Chrome (.html)
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="/api/bookmarks/export?format=json" download>
                    <Download className="h-4 w-4" /> Export full backup (.json)
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setBackupsOpen(true)}>
                  <ArchiveRestore className="h-4 w-4" /> Restore from backup…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setStorageOpen(true)}>
                  <HardDrive className="h-4 w-4" /> Storage location…
                  {storage && !storage.isDefault && (
                    <span className="ml-auto text-[10px]" style={{ color: "var(--app-text-faint)" }}>{storage.label}</span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4" /> Import from browser…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Add — CTA button styled per theme */}
            <CtaButton onClick={() => setDialogOpen(true)} title="Add bookmark ( N )">
              <Plus className="h-3.5 w-3.5" />
              Add
            </CtaButton>
          </div>
        </header>

        <StorageBanner
          status={storage}
          initialError={initialStorageError}
          onRetry={reloadFromServer}
          onOpenSettings={() => setStorageOpen(true)}
          onResolved={handleRestored}
        />

        {/* Pinned strip */}
        {!searchQuery && <PinnedStrip bookmarks={pinned} onPin={handlePin} onEdit={handleEdit} onReorder={handleReorder} />}

        {/* Most used / Recent get their own views; Manual (and any search) uses the category grid */}
        {waitingForData ? null : sortMode !== "manual" && !isSearching ? (
          <UsageView
            mode={sortMode}
            bookmarks={bookmarks}
            syncedAt={usageSyncedAt}
            onPin={handlePin}
            onDelete={handleDelete}
            onRename={handleRename}
            onEdit={handleEdit}
          />
        ) : (
          <BookmarkGroupedList
            bookmarks={listBookmarks}
            loading={loading}
            searchQuery={searchQuery}
            onPin={handlePin}
            onDelete={handleDelete}
            onRename={handleRename}
            onEdit={handleEdit}
            onReorder={handleReorder}
            selectedId={selectedId}
          />
        )}
      </div>

      <AddBookmarkDialog open={dialogOpen} onOpenChange={setDialogOpen} onAdded={handleAdded} categories={categories} />
      <EditBookmarkDialog
        bookmark={editing}
        categories={categories}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        onSaved={handleEdited}
      />
      <ImportBookmarksDialog open={importOpen} onOpenChange={setImportOpen} onImported={handleImported} />
      <TidyCategoriesDialog open={tidyOpen} onOpenChange={setTidyOpen} bookmarks={bookmarks} onApplied={handleTidyApplied} />
      <LinkCheckDialog
        open={linkCheckOpen}
        onOpenChange={setLinkCheckOpen}
        bookmarks={bookmarks}
        statuses={linkStatus}
        onStatus={handleLinkStatus}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
      <BackupsDialog open={backupsOpen} onOpenChange={setBackupsOpen} onRestored={handleRestored} />
      <StorageDialog
        open={storageOpen}
        onOpenChange={(o) => { setStorageOpen(o); if (o) refreshStorage(); }}
        status={storage}
        onChanged={handleRestored}
      />
      {selectMode && (
        <BulkActionBar
          count={selectedIds.size}
          total={selectableIds.length}
          categories={categories}
          onSelectAll={() => setSelectedIds(new Set(selectableIds))}
          onClear={() => setSelectedIds(new Set())}
          onPin={(pin) => runBulk(pin ? "pin" : "unpin", Array.from(selectedIds))}
          onMove={(category) => runBulk("move", Array.from(selectedIds), category)}
          onDelete={() => deleteWithUndo(Array.from(selectedIds))}
          onDone={exitSelectMode}
        />
      )}
      {undoMessage && (
        <UndoToast message={undoMessage} onUndo={undoDelete} onDismiss={() => commitPendingDelete()} raised={selectMode} />
      )}
    </main>
    </BookmarkViewContext.Provider>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => setTheme(next)}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
      className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors"
      style={{ color: "var(--app-text-muted)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(128,128,128,0.1)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

/** CTA button that uses --app-cta-bg which can be a gradient (colorful) or flat colour (light/dark) */
function CtaButton({ onClick, title, children }: { onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
      style={{
        background: "var(--app-cta-bg)",
        color: "var(--app-cta-text)",
      }}
    >
      {children}
    </button>
  );
}

export function HomeClient({ initialBookmarks, initialStorageError }: HomeClientProps) {
  return (
    <Suspense>
      <HomeInner initialBookmarks={initialBookmarks} initialStorageError={initialStorageError} />
    </Suspense>
  );
}
