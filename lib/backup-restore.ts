import fs from "fs";
import path from "path";
import { parseBackupName, type BackupKind } from "./backup";
import { backupsDir } from "./paths";
import { validateBookmarks, validateRules } from "./restore";
import type { Bookmark } from "./types";
import type { CategoryRules } from "./category-rules";

type LoadedBackup =
  | { kind: "bookmarks"; createdAt: Date; data: Bookmark[] }
  | { kind: "category-rules"; createdAt: Date; data: CategoryRules };

/** Reads and validates a backup by file name. */
export async function loadBackup(name: string): Promise<{ ok: true; backup: LoadedBackup } | { ok: false; status: number; error: string }> {
  const parsed = parseBackupName(name);
  if (!parsed) return { ok: false, status: 404, error: "Backup not found" };
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.promises.readFile(path.join(backupsDir(), name), "utf-8"));
  } catch (err) {
    const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
    return { ok: false, status: missing ? 404 : 422, error: missing ? "Backup not found" : "Backup file is not valid JSON" };
  }
  const kind: BackupKind = parsed.kind;
  if (kind === "bookmarks") {
    const v = validateBookmarks(raw);
    return v.ok ? { ok: true, backup: { kind, createdAt: parsed.createdAt, data: v.value } } : { ok: false, status: 422, error: v.error };
  }
  const v = validateRules(raw);
  return v.ok ? { ok: true, backup: { kind, createdAt: parsed.createdAt, data: v.value } } : { ok: false, status: 422, error: v.error };
}
