import { NextResponse } from "next/server";
import { readBookmarks } from "@/lib/bookmarks";
import { currentStatuses, readLinkStatus } from "@/lib/link-status";
import { withStorageErrors } from "@/lib/api-errors";

/** GET /api/links → { statuses: { [bookmarkId]: LinkStatus } } from the last check. */
async function handleGET() {
  const [map, bookmarks] = await Promise.all([readLinkStatus(), readBookmarks()]);
  return NextResponse.json({ statuses: currentStatuses(map, bookmarks) });
}

export const GET = withStorageErrors(handleGET);
