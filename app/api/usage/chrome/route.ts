import { NextRequest, NextResponse } from "next/server";
import { setChromeUsage } from "@/lib/bookmarks";
import { parseChromeUsageBody } from "@/lib/bookmark-input";
import { writeJSON } from "@/lib/fs-store";
import { usageSyncFile } from "@/lib/paths";
import { withStorageErrors } from "@/lib/api-errors";

/**
 * POST /api/usage/chrome   (sent by the Chrome extension)
 * Body: { items: [{ id, visits, lastVisitAt }] } — Chrome-history visits to
 * each bookmarked URL over the last 90 days. → { changed }
 */
async function handlePOST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }
  const parsed = parseChromeUsageBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const changed = await setChromeUsage(parsed.value);
  await writeJSON(usageSyncFile(), { syncedAt: new Date().toISOString(), items: parsed.value.length });
  return NextResponse.json({ changed });
}

export const POST = withStorageErrors(handlePOST);
