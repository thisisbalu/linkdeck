import { NextRequest, NextResponse } from "next/server";
import { readBookmarks, setCategories } from "@/lib/bookmarks";
import { readCategoryRules, ruleHost, setCategoryRules } from "@/lib/category-rules";
import { BUILTIN_CATEGORIES, enrichBookmark } from "@/lib/enrich-bookmark";
import { GENERAL, suggestCategory } from "@/lib/categorize";
import { parseCategorizeBody } from "@/lib/bookmark-input";
import { withStorageErrors } from "@/lib/api-errors";

/**
 * GET /api/bookmarks/categorize
 * Suggestions for every bookmark filed under "General".
 * → { items: [{ id, suggestion: { category, reason } | null }], rules, categories }
 */
async function handleGET() {
  const [bookmarks, rules] = await Promise.all([readBookmarks(), readCategoryRules()]);

  const items = await Promise.all(
    bookmarks
      .filter((b) => b.category === GENERAL)
      .map(async (b) => {
        // Passing the saved title skips any network fetch.
        const builtIn = await enrichBookmark(b.url, b.title);
        const suggestion = suggestCategory(b.url, b.title, {
          rules,
          bookmarks,
          builtInCategory: builtIn.category,
          useKeywords: true,
          excludeId: b.id,
        });
        return { id: b.id, suggestion };
      })
  );

  const categories = Array.from(
    new Set([...bookmarks.map((b) => b.category), ...BUILTIN_CATEGORIES].filter((c) => c !== GENERAL))
  ).sort((a, b) => a.localeCompare(b));

  return NextResponse.json({ items, rules, categories });
}

/**
 * POST /api/bookmarks/categorize
 * Body: { items: [{ id, category }], remember?: boolean }
 * Moves bookmarks to new categories; with `remember`, also saves a site rule
 * for each moved bookmark so future saves from that site land there too.
 */
async function handlePOST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }
  const parsed = parseCategorizeBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const updated = await setCategories(parsed.value.items);

  let rules = await readCategoryRules();
  if (parsed.value.remember && updated.length) {
    const entries = updated
      .filter((b) => b.category !== GENERAL)
      .map((b) => ({ host: ruleHost(b.url), category: b.category }))
      .filter((e) => e.host);
    if (entries.length) rules = await setCategoryRules(entries);
  }

  return NextResponse.json({ updated, rules });
}

export const GET = withStorageErrors(handleGET);
export const POST = withStorageErrors(handlePOST);
