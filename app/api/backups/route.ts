import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { backupIfDue, listBackups, parseBackupName, BACKUP_KINDS } from "@/lib/backup";
import { withLock } from "@/lib/lock";
import { backupsDir, bookmarksFile, categoryRulesFile } from "@/lib/paths";
import { withStorageErrors } from "@/lib/api-errors";

type Entry = { name: string; createdAt: string; count: number | null; size: number };

function describe(name: string): Entry {
  const file = path.join(backupsDir(), name);
  const size = fs.statSync(file).size;
  let count: number | null = null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    count = Array.isArray(data) ? data.length : data && typeof data === "object" ? Object.keys(data).length : null;
  } catch { /* unreadable — shown without a count */ }
  return { name, createdAt: parseBackupName(name)!.createdAt.toISOString(), count, size };
}

/** GET /api/backups → { bookmarks: Entry[], rules: Entry[] }, newest first. */
async function handleGET() {
  const [bookmarks, rules] = BACKUP_KINDS.map((kind) => listBackups(backupsDir(), kind).map(describe));
  return NextResponse.json({ bookmarks, rules });
}

/** POST /api/backups → snapshot bookmarks (and site rules, if any) right now. */
async function handlePOST() {
  const created: string[] = [];
  const b = await withLock("bookmarks", async () => backupIfDue(bookmarksFile(), backupsDir(), { intervalMs: 0 }));
  if (b) created.push(path.basename(b));
  const r = await withLock("category-rules", async () =>
    backupIfDue(categoryRulesFile(), backupsDir(), { prefix: "category-rules", intervalMs: 0 }));
  if (r) created.push(path.basename(r));
  return NextResponse.json({ created });
}

export const GET = withStorageErrors(handleGET);
export const POST = withStorageErrors(handlePOST);
