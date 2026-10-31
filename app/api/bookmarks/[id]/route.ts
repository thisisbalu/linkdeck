import { NextRequest, NextResponse } from "next/server";
import {
  deleteBookmark,
  readBookmarks,
  updateBookmark,
  BookmarkNotFoundError,
  DuplicateBookmarkError,
} from "@/lib/bookmarks";
import { parseBookmarkUpdate } from "@/lib/bookmark-input";
import { fetchAndSaveFavicon } from "@/lib/favicon";
import { hostnameOf } from "@/lib/url";
import { withStorageErrors } from "@/lib/api-errors";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/bookmarks/[id]
 * Accepts only: title, url, description, category, tags, pinned.
 */
async function handlePATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const parsed = parseBookmarkUpdate(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const updates: Parameters<typeof updateBookmark>[1] = { ...parsed.value };

  // Refresh the favicon when the URL moves to a different host.
  if (updates.url) {
    const current = (await readBookmarks()).find((b) => b.id === id);
    if (!current) return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    if (hostnameOf(updates.url) !== hostnameOf(current.url)) {
      updates.favicon = await fetchAndSaveFavicon(updates.url).catch(() => "");
    }
  }

  try {
    const updated = await updateBookmark(id, updates);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof BookmarkNotFoundError) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }
    if (err instanceof DuplicateBookmarkError) {
      return NextResponse.json(
        { error: `Another bookmark already uses this URL ("${err.existing.title}")`, bookmark: err.existing },
        { status: 409 }
      );
    }
    throw err;
  }
}

async function handleDELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  await deleteBookmark(id);
  return NextResponse.json({ success: true });
}

export const PATCH = withStorageErrors(handlePATCH);
export const DELETE = withStorageErrors(handleDELETE);
