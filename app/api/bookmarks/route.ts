import { NextRequest, NextResponse } from "next/server";
import {
  readBookmarks,
  addBookmark,
  findBookmarkByUrl,
  DuplicateBookmarkError,
} from "@/lib/bookmarks";
import { fetchAndSaveFavicon } from "@/lib/favicon";
import { enrichBookmark } from "@/lib/enrich-bookmark";
import { parseNewBookmark } from "@/lib/bookmark-input";
import { readCategoryRules } from "@/lib/category-rules";
import { suggestCategory } from "@/lib/categorize";
import { normalizeUrl } from "@/lib/url";
import type { Bookmark } from "@/lib/types";
import { withStorageErrors } from "@/lib/api-errors";

function duplicateResponse(existing: Bookmark) {
  return NextResponse.json(
    { error: "This URL is already bookmarked", bookmark: existing },
    { status: 409 }
  );
}

/**
 * GET /api/bookmarks            → all bookmarks (pinned first, newest first)
 * GET /api/bookmarks?url=<url>  → bookmarks matching that URL (0 or 1)
 */
async function handleGET(request: NextRequest) {
  const bookmarks = await readBookmarks();

  const url = request.nextUrl.searchParams.get("url");
  if (url) {
    const key = normalizeUrl(url);
    return NextResponse.json(bookmarks.filter((b) => normalizeUrl(b.url) === key));
  }

  const sorted = [...bookmarks].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
  });

  return NextResponse.json(sorted);
}

/**
 * POST /api/bookmarks
 * Body: { url, title?, description?, faviconUrl? }
 * 201 with the new bookmark, 400 on invalid input, 409 if the URL is already saved.
 */
async function handlePOST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const parsed = parseNewBookmark(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { url, title, description, faviconUrl } = parsed.value;

  // Cheap pre-check so duplicates don't trigger page/favicon fetches.
  const existing = await findBookmarkByUrl(url);
  if (existing) return duplicateResponse(existing);

  const [favicon, enrichment, rules, all] = await Promise.all([
    fetchAndSaveFavicon(url, faviconUrl).catch(() => ""),
    enrichBookmark(url, title),
    readCategoryRules(),
    readBookmarks(),
  ]);
  const suggestion = suggestCategory(url, enrichment.title, {
    rules,
    bookmarks: all,
    builtInCategory: enrichment.category,
  });

  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    url,
    title: enrichment.title,
    description: description ?? enrichment.description,
    category: suggestion?.category ?? enrichment.category,
    tags: enrichment.tags,
    favicon,
    addedAt: new Date().toISOString(),
    pinned: false,
  };

  try {
    await addBookmark(bookmark);
  } catch (err) {
    if (err instanceof DuplicateBookmarkError) return duplicateResponse(err.existing);
    throw err;
  }

  return NextResponse.json(bookmark, { status: 201 });
}

export const GET = withStorageErrors(handleGET);
export const POST = withStorageErrors(handlePOST);
