import { NextRequest, NextResponse } from "next/server";
import { readBookmarks } from "@/lib/bookmarks";
import { readCategoryRules } from "@/lib/category-rules";
import { diffBookmarks, diffRules } from "@/lib/restore";
import { loadBackup } from "@/lib/backup-restore";
import { withStorageErrors } from "@/lib/api-errors";

type RouteParams = { params: Promise<{ name: string }> };

/** GET /api/backups/<name> → what restoring it would change. */
async function handleGET(_request: NextRequest, { params }: RouteParams) {
  const { name } = await params;
  const loaded = await loadBackup(name);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { backup } = loaded;
  const diff = backup.kind === "bookmarks"
    ? diffBookmarks(await readBookmarks(), backup.data)
    : diffRules(await readCategoryRules(), backup.data);
  return NextResponse.json({ name, kind: backup.kind, createdAt: backup.createdAt.toISOString(), diff });
}

export const GET = withStorageErrors(handleGET);
