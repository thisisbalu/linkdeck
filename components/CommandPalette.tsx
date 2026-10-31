"use client";

import { useEffect, useRef, useState } from "react";
import { ArchiveRestore, Bookmark, Download, HardDrive, Link2Off, Plus, Search, WandSparkles } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import type { Bookmark as BookmarkType } from "@/lib/types";
import { OPEN_BACKUPS_EVENT, OPEN_LINK_CHECK_EVENT, OPEN_STORAGE_EVENT, OPEN_TIDY_EVENT } from "@/lib/events";
import { openBookmarkInPlace, recordVisit } from "@/lib/navigation";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when user selects "Add Bookmark" */
  onAddBookmark?: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onAddBookmark,
}: CommandPaletteProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([]);
  // Always re-fetch when palette opens so data is fresh
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/bookmarks");
        if (cancelled) return;
        if (res.ok) setBookmarks(await res.json());
      } catch {
        // non-fatal
      }
    }
    load();
    return () => { cancelled = true; };
  }, [open]);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpenChange]);

  // ⌘/Ctrl held on the Enter or click that picks a bookmark → open it in a new tab.
  const newTabRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    const track = (e: KeyboardEvent | MouseEvent) => { newTabRef.current = e.metaKey || e.ctrlKey; };
    window.addEventListener("keydown", track, true);
    window.addEventListener("mousedown", track, true);
    return () => {
      window.removeEventListener("keydown", track, true);
      window.removeEventListener("mousedown", track, true);
    };
  }, [open]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search bookmarks…"
        className="text-zinc-100 placeholder:text-zinc-500"
      />
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-1 py-4 text-zinc-500">
            <Search size={20} className="opacity-40" />
            <span className="text-sm">No results found</span>
          </div>
        </CommandEmpty>

        {/* ── Bookmarks ── */}
        {bookmarks.length > 0 && (
          <CommandGroup heading="Bookmarks">
            {bookmarks.map((b) => (
              <CommandItem
                key={b.id}
                value={`bookmark ${b.title} ${b.category} ${b.tags.join(" ")} ${b.url}`}
                onSelect={() => {
                  onOpenChange(false);
                  recordVisit(b.id);
                  if (newTabRef.current) window.open(b.url, "_blank", "noopener,noreferrer");
                  else openBookmarkInPlace(b.url);
                }}
                className="flex items-center gap-2.5 cursor-pointer"
              >
                {b.favicon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.favicon}
                    alt=""
                    width={14}
                    height={14}
                    className="rounded-sm shrink-0"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <Bookmark size={14} className="shrink-0 text-zinc-500" />
                )}
                <span className="truncate flex-1">{b.title}</span>
                <span className="text-[10px] text-zinc-600 shrink-0 hidden sm:inline">
                  {b.category}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* ── Actions ── */}
        <CommandGroup heading="Actions">
          <CommandItem
            value="add bookmark new"
            onSelect={() => {
              onOpenChange(false);
              onAddBookmark?.();
            }}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <Plus size={14} className="text-zinc-500 shrink-0" />
            Add Bookmark
          </CommandItem>
          <CommandItem
            value="tidy up categories general organize"
            onSelect={() => {
              onOpenChange(false);
              window.dispatchEvent(new Event(OPEN_TIDY_EVENT));
            }}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <WandSparkles size={14} className="text-zinc-500 shrink-0" />
            Tidy up categories
          </CommandItem>
          <CommandItem
            value="check dead broken links"
            onSelect={() => {
              onOpenChange(false);
              window.dispatchEvent(new Event(OPEN_LINK_CHECK_EVENT));
            }}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <Link2Off size={14} className="text-zinc-500 shrink-0" />
            Check for dead links
          </CommandItem>
          <CommandItem
            value="export bookmarks chrome html download"
            onSelect={() => {
              onOpenChange(false);
              window.location.href = "/api/bookmarks/export?format=html";
            }}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <Download size={14} className="text-zinc-500 shrink-0" />
            Export bookmarks for Chrome
          </CommandItem>
          <CommandItem
            value="restore backup undo history"
            onSelect={() => {
              onOpenChange(false);
              window.dispatchEvent(new Event(OPEN_BACKUPS_EVENT));
            }}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <ArchiveRestore size={14} className="text-zinc-500 shrink-0" />
            Restore from backup
          </CommandItem>
          <CommandItem
            value="storage location data folder cloud box onedrive sync move"
            onSelect={() => {
              onOpenChange(false);
              window.dispatchEvent(new Event(OPEN_STORAGE_EVENT));
            }}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <HardDrive size={14} className="text-zinc-500 shrink-0" />
            Storage location
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex justify-end gap-3 border-t px-3 py-1.5 text-[10px] text-zinc-500">
        <span>↵ open</span>
        <span>⌘↵ new tab</span>
        <span>esc close</span>
      </div>
    </CommandDialog>
  );
}
