import { NextRequest, NextResponse } from "next/server";
import { ConflictError, resolveConflict } from "@/lib/conflicts";
import { withStorageErrors } from "@/lib/api-errors";

/**
 * POST /api/storage/conflicts   Body: { file: "bookmarks (1).json", action: "merge" | "keep-mine" | "keep-theirs" }
 * The conflict copy is kept as a backup either way.
 */
async function handlePOST(request: NextRequest) {
  let body: { file?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }
  try {
    return NextResponse.json(await resolveConflict(body?.file, body?.action));
  } catch (err) {
    if (err instanceof ConflictError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export const POST = withStorageErrors(handlePOST);
