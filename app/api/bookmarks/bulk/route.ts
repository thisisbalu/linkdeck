import { NextRequest, NextResponse } from "next/server";
import { bulkDelete, bulkUpdate } from "@/lib/bookmarks";
import { parseBulkBody } from "@/lib/bookmark-input";
import { withStorageErrors } from "@/lib/api-errors";

/**
 * POST /api/bookmarks/bulk
 * Body: { action: "pin" | "unpin" | "delete", ids } or { action: "move", ids, category }
 * → { updated: Bookmark[] } or { deleted: number }
 */
async function handlePOST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }
  const parsed = parseBulkBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const op = parsed.value;
  switch (op.action) {
    case "delete":
      return NextResponse.json({ deleted: await bulkDelete(op.ids) });
    case "pin":
    case "unpin":
      return NextResponse.json({ updated: await bulkUpdate(op.ids, { pinned: op.action === "pin" }) });
    case "move":
      return NextResponse.json({ updated: await bulkUpdate(op.ids, { category: op.category }) });
  }
}

export const POST = withStorageErrors(handlePOST);
