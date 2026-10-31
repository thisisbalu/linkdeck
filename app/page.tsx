import { readBookmarks } from "@/lib/bookmarks";
import { StorageUnavailableError } from "@/lib/paths";
import { HomeClient } from "@/components/HomeClient";
import type { Bookmark } from "@/lib/types";

// Bookmarks live in a JSON file that changes at runtime, so never prerender.
export const dynamic = "force-dynamic";

export default async function Page() {
  // Read bookmarks directly from disk on the server — no API call, no compile delay
  let bookmarks: Bookmark[] = [];
  let storageError: string | null = null;
  try {
    bookmarks = await readBookmarks();
  } catch (err) {
    // e.g. the chosen cloud folder isn't mounted: show why instead of crashing.
    if (!(err instanceof StorageUnavailableError)) throw err;
    storageError = err.message;
  }

  // Sort: pinned first, then addedAt desc
  const sorted = [...bookmarks].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
  });

  return <HomeClient initialBookmarks={sorted} initialStorageError={storageError} />;
}
