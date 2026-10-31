import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { replaceAllBookmarks } from "@/lib/bookmarks";
import { replaceCategoryRules } from "@/lib/category-rules";
import { loadBackup } from "@/lib/backup-restore";
import { withStorageErrors } from "@/lib/api-errors";

type RouteParams = { params: Promise<{ name: string }> };

/**
 * POST /api/backups/<name>/restore
 * Replaces current bookmarks (or site rules) with the backup. The current
 * state is saved as a new backup first, so the restore can be undone.
 */
async function handlePOST(_request: NextRequest, { params }: RouteParams) {
  const { name } = await params;
  const loaded = await loadBackup(name);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { backup } = loaded;

  const safety = backup.kind === "bookmarks"
    ? await replaceAllBookmarks(backup.data)
    : await replaceCategoryRules(backup.data);

  return NextResponse.json({
    restored: backup.kind,
    count: Array.isArray(backup.data) ? backup.data.length : Object.keys(backup.data).length,
    safetyBackup: safety ? path.basename(safety) : null,
  });
}

export const POST = withStorageErrors(handlePOST);
