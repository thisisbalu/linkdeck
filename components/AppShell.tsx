"use client";

import { useState, useEffect, createContext, useContext } from "react";
import { CommandPalette } from "@/components/CommandPalette";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/lib/events";
import { AddBookmarkDialog } from "@/components/AddBookmarkDialog";

// Increment counter triggers home page to re-fetch bookmarks
const BookmarkRefreshContext = createContext<number>(0);
export function useBookmarkRefreshKey() { return useContext(BookmarkRefreshContext); }

export function AppShell({ children }: { children: React.ReactNode }) {
  const [cmdOpen, setCmdOpen] = useState(false);
  const [addBookmarkOpen, setAddBookmarkOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function triggerBookmarkRefresh() {
    setRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    const open = () => setCmdOpen(true);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, open);
    return () => window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, open);
  }, []);

  return (
    <BookmarkRefreshContext.Provider value={refreshKey}>
      {/* Command palette — always mounted, hidden until triggered */}
      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onAddBookmark={() => setAddBookmarkOpen(true)}
      />

      {/* Add Bookmark from command palette — triggers home page refresh on success */}
      <AddBookmarkDialog
        open={addBookmarkOpen}
        onOpenChange={setAddBookmarkOpen}
        onAdded={triggerBookmarkRefresh}
      />

      {/* Transparent: the page background (theme + Background setting) is on <body>. */}
      <div className="min-h-screen">
        {children}
      </div>
    </BookmarkRefreshContext.Provider>
  );
}
