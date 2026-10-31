import { NextRequest, NextResponse } from "next/server";
import { readBookmarks } from "@/lib/bookmarks";
import { readCategoryRules } from "@/lib/category-rules";
import { toJsonExport, toNetscapeHtml } from "@/lib/export";
import { withStorageErrors } from "@/lib/api-errors";

/**
 * GET /api/bookmarks/export?format=html  → Netscape bookmark file (import into Chrome etc.)
 * GET /api/bookmarks/export?format=json  → full backup (all fields + site rules)
 */
async function handleGET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") ?? "html";
  const date = new Date().toISOString().slice(0, 10);
  const bookmarks = await readBookmarks();

  if (format === "json") {
    const body = JSON.stringify(toJsonExport(bookmarks, await readCategoryRules()), null, 2);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="linkdeck-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (format === "html") {
    return new NextResponse(toNetscapeHtml(bookmarks), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="linkdeck-bookmarks-${date}.html"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return NextResponse.json({ error: "format must be html or json" }, { status: 400 });
}

export const GET = withStorageErrors(handleGET);
