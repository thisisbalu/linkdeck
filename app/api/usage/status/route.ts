import { NextResponse } from "next/server";
import { readJSON } from "@/lib/fs-store";
import { usageSyncFile } from "@/lib/paths";
import { withStorageErrors } from "@/lib/api-errors";

/** GET /api/usage/status → { syncedAt: string | null } — last Chrome-history sync from the extension. */
async function handleGET() {
  const data = await readJSON<{ syncedAt?: string }>(usageSyncFile());
  return NextResponse.json({ syncedAt: data?.syncedAt ?? null });
}

export const GET = withStorageErrors(handleGET);
