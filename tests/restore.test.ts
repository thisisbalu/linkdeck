/**
 * Tests for lib/restore.ts, parseBackupName, and replace-with-safety-backup
 * (real files in the temp LINKDECK_DATA_DIR set by tests/setup.ts).
 */

import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { diffBookmarks, diffRules, parseRestoreFile, validateBookmarks, validateRules } from "@/lib/restore";
import { backupFileName, listBackups, parseBackupName } from "@/lib/backup";
import { replaceAllBookmarks, readBookmarks } from "@/lib/bookmarks";
import { replaceCategoryRules, readCategoryRules } from "@/lib/category-rules";
import { backupsDir, bookmarksFile, categoryRulesFile } from "@/lib/paths";
import type { Bookmark } from "@/lib/types";

const b = (o: Partial<Bookmark> = {}): Bookmark => ({
  id: "a", url: "https://a.com", title: "A", description: "", category: "Work", tags: [], favicon: "",
  addedAt: "2026-01-01T00:00:00.000Z", pinned: false, ...o,
});

describe("validateBookmarks", () => {
  it("accepts valid bookmarks, fills defaults and drops unknown fields", () => {
    const r = validateBookmarks([{ id: "a", url: "https://a.com", title: "A", category: "Work", addedAt: "2026-01-01T00:00:00.000Z", extra: 1, visitCount: 2.7 }]);
    expect(r).toEqual({ ok: true, value: [{ ...b(), visitCount: 2 }] });
  });

  it("rejects malformed entries with a useful message", () => {
    expect(validateBookmarks({})).toMatchObject({ ok: false });
    expect(validateBookmarks([b({ url: "javascript:x" })])).toEqual({ ok: false, error: "Bookmark #1 has an invalid URL" });
    expect(validateBookmarks([b(), b()])).toEqual({ ok: false, error: "Bookmark #2 repeats id a" });
    expect(validateBookmarks([b({ addedAt: "nope" })]).ok).toBe(false);
    expect(validateBookmarks([b({ category: " " })]).ok).toBe(false);
    expect(validateBookmarks([{ ...b(), tags: [1] }]).ok).toBe(false);
  });
});

describe("validateRules / parseRestoreFile", () => {
  it("validates rules", () => {
    expect(validateRules({ "figma.com": "Design" }).ok).toBe(true);
    expect(validateRules({ "bad host": "x" }).ok).toBe(false);
    expect(validateRules({ "a.com": "" }).ok).toBe(false);
    expect(validateRules([]).ok).toBe(false);
  });

  it("accepts the JSON export and raw bookmarks.json", () => {
    expect(parseRestoreFile({ app: "linkdeck", bookmarks: [b()], categoryRules: { "a.com": "Work" } }))
      .toEqual({ ok: true, value: { bookmarks: [b()], categoryRules: { "a.com": "Work" } } });
    expect(parseRestoreFile([b()])).toEqual({ ok: true, value: { bookmarks: [b()] } });
    expect(parseRestoreFile({ hello: 1 }).ok).toBe(false);
    expect(parseRestoreFile({ bookmarks: [b()], categoryRules: { "x y": "z" } }).ok).toBe(false);
  });
});

describe("diffs", () => {
  it("reports what a bookmark restore would bring back, remove and revert", () => {
    const current = [b({ id: "1", title: "Keep" }), b({ id: "2", title: "New since" }), b({ id: "3", title: "Renamed now" })];
    const backup = [b({ id: "1", title: "Keep", visitCount: 5 }), b({ id: "3", title: "Old name" }), b({ id: "4", title: "Deleted since" })];
    expect(diffBookmarks(current, backup)).toEqual({
      current: 3, backup: 3, added: ["Deleted since"], removed: ["New since"], changed: ["Old name"],
    });
  });

  it("reports rule differences, including prototype-like hosts", () => {
    expect(diffRules({ "a.com": "X", constructor: "Y" }, { "a.com": "Z", "b.com": "W" })).toEqual({
      current: 2, backup: 2, added: ["b.com → W"], removed: ["constructor → Y"], changed: ["a.com → Z"],
    });
    expect(diffRules({}, { constructor: "Y" }).added).toEqual(["constructor → Y"]);
  });
});

describe("parseBackupName", () => {
  it("recognizes both kinds and rejects anything else", () => {
    const d = new Date("2026-10-27T17:12:24.180Z");
    expect(parseBackupName(backupFileName(d))).toEqual({ kind: "bookmarks", createdAt: d });
    expect(parseBackupName(backupFileName(d, "category-rules"))).toEqual({ kind: "category-rules", createdAt: d });
    for (const bad of ["bookmarks.json", "../bookmarks-2026-10-27T17-12-24-180Z.json", "bookmarks-2026-10-27.json", "x-2026-10-27T17-12-24-180Z.json"]) {
      expect(parseBackupName(bad)).toBeNull();
    }
  });
});

describe("replace with safety backup", () => {
  beforeEach(() => {
    fs.rmSync(backupsDir(), { recursive: true, force: true });
  });

  it("snapshots current bookmarks before replacing, even within the hourly window", async () => {
    fs.mkdirSync(path.dirname(bookmarksFile()), { recursive: true });
    fs.writeFileSync(bookmarksFile(), JSON.stringify([b({ title: "Before" })]));
    await replaceAllBookmarks([b({ title: "After" })]);
    await replaceAllBookmarks([b({ title: "After again" })]);

    expect((await readBookmarks())[0].title).toBe("After again");
    const snaps = listBackups(backupsDir());
    expect(snaps).toHaveLength(2);
    const oldest = JSON.parse(fs.readFileSync(path.join(backupsDir(), snaps[1]), "utf-8"));
    expect(oldest[0].title).toBe("Before");
  });

  it("snapshots current rules before replacing", async () => {
    fs.writeFileSync(categoryRulesFile(), JSON.stringify({ "a.com": "Old" }));
    const safety = await replaceCategoryRules({ "b.com": "New" });
    expect(await readCategoryRules()).toEqual({ "b.com": "New" });
    expect(JSON.parse(fs.readFileSync(safety!, "utf-8"))).toEqual({ "a.com": "Old" });
  });
});
