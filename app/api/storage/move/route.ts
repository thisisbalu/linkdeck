import { NextRequest, NextResponse } from "next/server";
import { moveData, StorageMoveError, type MoveMode } from "@/lib/storage";
import { StorageUnavailableError } from "@/lib/paths";

/**
 * POST /api/storage/move   Body: { target: "/path/to/folder", mode?: "auto" | "replace" | "use-existing" }
 * Copies (and verifies) all data to the folder and switches to it — no restart.
 * 409 { needsChoice, existing, current } when the folder already has Linkdeck data and mode is "auto".
 */
export async function POST(request: NextRequest) {
  let body: { target?: unknown; mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }
  try {
    const result = await moveData(body?.target, (body?.mode ?? "auto") as MoveMode);
    return NextResponse.json(result, { status: result.needsChoice ? 409 : 200 });
  } catch (err) {
    if (err instanceof StorageMoveError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof StorageUnavailableError) {
      return NextResponse.json(
        { error: `${err.message} To switch anyway, choose a folder that already has your Linkdeck data and pick “Use the data that's there”.`, storageUnavailable: true },
        { status: 503 }
      );
    }
    throw err;
  }
}
