import { NextRequest, NextResponse } from "next/server";
import { enrichBookmark } from "@/lib/enrich-bookmark";
import { readBookmarks } from "@/lib/bookmarks";
import { readCategoryRules } from "@/lib/category-rules";
import { suggestCategory } from "@/lib/categorize";
import { withStorageErrors } from "@/lib/api-errors";

/**
 * GET /api/bookmarks/enrich?url=...&title=...
 *
 * Lightweight preview endpoint used by the Chrome extension popup.
 * Returns category + tags for a given URL (and optional pre-supplied title)
 * without saving anything.
 */
async function handleGET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const title = request.nextUrl.searchParams.get("title") ?? undefined;

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const [enrichment, rules, bookmarks] = await Promise.all([
    enrichBookmark(url, title),
    readCategoryRules(),
    readBookmarks(),
  ]);
  const suggestion = suggestCategory(url, enrichment.title, {
    rules,
    bookmarks,
    builtInCategory: enrichment.category,
  });

  return NextResponse.json({
    category: suggestion?.category ?? enrichment.category,
    tags: enrichment.tags,
  });
}

export const GET = withStorageErrors(handleGET);
