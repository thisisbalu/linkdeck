import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { replaceAllBookmarks } from "@/lib/bookmarks";
import { replaceCategoryRules } from "@/lib/category-rules";
import { parseRestoreFile } from "@/lib/restore";
import { withStorageErrors } from "@/lib/api-errors";

/**
 * POST /api/backups/restore-file
 * Body: the contents of an "Export full backup (.json)" file, or a raw
 * bookmarks.json array. Current data is backed up first.
 */
async function handlePOST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "File is not valid JSON" }, { status: 400 });
  }
  const parsed = parseRestoreFile(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  const safetyBackups: string[] = [];
  const b = await replaceAllBookmarks(parsed.value.bookmarks);
  if (b) safetyBackups.push(path.basename(b));
  if (parsed.value.categoryRules) {
    const r = await replaceCategoryRules(parsed.value.categoryRules);
    if (r) safetyBackups.push(path.basename(r));
  }

  return NextResponse.json({
    bookmarks: parsed.value.bookmarks.length,
    rules: parsed.value.categoryRules ? Object.keys(parsed.value.categoryRules).length : null,
    safetyBackups,
  });
}

export const POST = withStorageErrors(handlePOST);
