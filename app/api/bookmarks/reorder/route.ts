import { NextRequest, NextResponse } from "next/server";
import { reorderBookmarks } from "@/lib/bookmarks";
import { parseReorder } from "@/lib/bookmark-input";
import { withStorageErrors } from "@/lib/api-errors";

/**
 * POST /api/bookmarks/reorder
 * Body: { items: [{ id, sortOrder, category? }] }
 * Persists drag-and-drop ordering and cross-category moves.
 */
async function handlePOST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const parsed = parseReorder(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  await reorderBookmarks(parsed.value);
  return NextResponse.json({ success: true });
}

export const POST = withStorageErrors(handlePOST);
