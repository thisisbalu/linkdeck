import { NextRequest, NextResponse } from "next/server";
import { recordVisit, BookmarkNotFoundError } from "@/lib/bookmarks";
import { withStorageErrors } from "@/lib/api-errors";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/bookmarks/[id]/visit — counts an open from Linkdeck (for "Most used" / "Recent"). */
async function handlePOST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const b = await recordVisit(id);
    return NextResponse.json({ visitCount: b.visitCount, lastVisitedAt: b.lastVisitedAt });
  } catch (err) {
    if (err instanceof BookmarkNotFoundError) return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    throw err;
  }
}

export const POST = withStorageErrors(handlePOST);
