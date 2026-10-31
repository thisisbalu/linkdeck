/**
 * Tests for configurable storage: lib/paths.ts (config + availability),
 * lib/storage.ts (move/switch) and lib/conflicts.ts — all on real temp folders.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  assertStorageAvailable, dataDir, dataSource, defaultDataDir, writeConfig, readConfig, StorageUnavailableError,
} from "@/lib/paths";
import { moveData, storageStatus, StorageMoveError } from "@/lib/storage";
import { findConflicts, mergeBookmarks, resolveConflict } from "@/lib/conflicts";
import { readBookmarks, setChromeUsage } from "@/lib/bookmarks";
import { readCategoryRules } from "@/lib/category-rules";
import { listBackups } from "@/lib/backup";
import type { Bookmark } from "@/lib/types";

let root: string;
let cloud: string;

const bm = (id: string, o: Partial<Bookmark> = {}): Bookmark => ({
  id, url: `https://${id}.example.com`, title: id, description: "", category: "Work", tags: [], favicon: "",
  addedAt: "2026-01-01T00:00:00.000Z", pinned: false, ...o,
});
const write = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data));
};
const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf-8"));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "linkdeck-proj-"));
  cloud = fs.mkdtempSync(path.join(os.tmpdir(), "linkdeck-cloud-"));
  vi.stubEnv("LINKDECK_ROOT", root);
  vi.stubEnv("LINKDECK_DATA_DIR", "");
  writeConfig(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cloud, { recursive: true, force: true });
});

function seedDefault(bookmarks: Bookmark[] = [bm("a"), bm("b")]) {
  const d = defaultDataDir();
  write(path.join(d, "bookmarks.json"), bookmarks);
  write(path.join(d, "category-rules.json"), { "figma.com": "Design" });
  write(path.join(d, "link-status.json"), {});
  write(path.join(d, "backups", "bookmarks-2026-10-27T10-00-00-000Z.json"), [bm("a")]);
  write(path.join(d, "favicons", "a.example.com.png"), "PNG-A");
}

describe("data folder resolution", () => {
  it("uses <project>/data by default, the config file when set, and the env var above both", () => {
    expect(dataDir()).toBe(path.join(root, "data"));
    expect(dataSource()).toBe("default");
    writeConfig(path.join(cloud, "A"));
    expect(dataDir()).toBe(path.join(cloud, "A"));
    expect(dataSource()).toBe("config");
    writeConfig(path.join(cloud, "B"));
    expect(dataDir()).toBe(path.join(cloud, "B"));
    vi.stubEnv("LINKDECK_DATA_DIR", "/somewhere/else");
    expect(dataDir()).toBe("/somewhere/else");
    expect(dataSource()).toBe("env");
  });

  it("ignores a broken or relative config", () => {
    write(path.join(root, "linkdeck.config.json"), "{ nope");
    expect(dataDir()).toBe(defaultDataDir());
    write(path.join(root, "linkdeck.config.json"), { dataDir: "relative/path" });
    expect(readConfig()).toEqual({});
  });
});

describe("availability guard", () => {
  it("refuses a chosen folder that is missing or has no bookmarks.json — never treats it as empty", async () => {
    const target = path.join(cloud, "Linkdeck");
    writeConfig(target);
    expect(() => assertStorageAvailable()).toThrow(StorageUnavailableError);
    await expect(readBookmarks()).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(setChromeUsage([])).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(fs.existsSync(target)).toBe(false); // nothing was created

    fs.mkdirSync(target);
    expect(() => assertStorageAvailable()).toThrow(/still be downloading/);
    write(path.join(target, "bookmarks.json"), [bm("x")]);
    expect(() => assertStorageAvailable()).not.toThrow();
    expect((await readBookmarks()).map((b) => b.id)).toEqual(["x"]);
  });

  it("still treats a missing default folder as a fresh start", async () => {
    expect(await readBookmarks()).toEqual([]);
  });
});

describe("moveData", () => {
  it("copies and verifies everything, switches, and keeps the old project folder", async () => {
    seedDefault();
    const target = path.join(cloud, "Linkdeck");
    const r = await moveData(target);
    expect(r.needsChoice).toBe(false);
    if (r.needsChoice) return;
    expect(r.mode).toBe("copied");
    expect(r.copied.files).toBe(5); // 3 json + 1 backup + 1 favicon
    expect(dataDir()).toBe(target);
    expect(dataSource()).toBe("config");
    expect((await readBookmarks()).map((b) => b.id)).toEqual(["a", "b"]);
    expect(await readCategoryRules()).toEqual({ "figma.com": "Design" });
    expect(listBackups(path.join(target, "backups"))).toHaveLength(1);
    expect(fs.readFileSync(path.join(target, "favicons", "a.example.com.png"), "utf-8")).toBe("PNG-A");
    expect(fs.existsSync(defaultDataDir())).toBe(false);
    expect(r.previous && read(path.join(r.previous, "bookmarks.json"))).toHaveLength(2); // kept, not deleted
    expect(fs.readdirSync(target).some((n) => n.includes("linkdeck-copy") || n.includes("write-test"))).toBe(false);
  });

  it("creates bookmarks.json even when there were no bookmarks yet", async () => {
    const target = path.join(cloud, "Linkdeck");
    await moveData(target);
    expect(read(path.join(target, "bookmarks.json"))).toEqual([]);
    expect(() => assertStorageAvailable()).not.toThrow();
  });

  it("rejects unsafe or invalid targets", async () => {
    seedDefault();
    const bad = async (t: string, re: RegExp) => {
      const err = await moveData(t).catch((e) => e);
      expect(err).toBeInstanceOf(StorageMoveError);
      expect(err.message).toMatch(re);
    };
    await bad("relative/folder", /full path/);
    await bad(os.homedir(), /folder of its own/);
    await bad("/", /folder of its own/);
    await bad(path.join(root, "app"), /inside the app/);
    await bad(defaultDataDir(), /already using/);
    await bad(path.join(defaultDataDir(), "sub"), /inside the app|inside the current/);
    await bad(path.join(cloud, "missing-parent", "Linkdeck"), /doesn't exist/);
    write(path.join(cloud, "Documents", "report.pdf"), "x");
    await bad(path.join(cloud, "Documents"), /already has other files/);
    expect(dataDir()).toBe(defaultDataDir()); // nothing switched
  });

  it("asks before touching a folder that already has data, then uses or replaces it", async () => {
    seedDefault();
    const target = path.join(cloud, "Linkdeck");
    write(path.join(target, "bookmarks.json"), [bm("theirs")]);
    write(path.join(target, "category-rules.json"), { "x.com": "X" });

    const ask = await moveData(target);
    expect(ask.needsChoice).toBe(true);
    if (ask.needsChoice) {
      expect(ask.existing.bookmarks).toBe(1);
      expect(ask.current.bookmarks).toBe(2);
    }
    expect(dataDir()).toBe(defaultDataDir());

    const replaced = await moveData(target, "replace");
    expect(!replaced.needsChoice && replaced.mode).toBe("replaced");
    expect((await readBookmarks()).map((b) => b.id)).toEqual(["a", "b"]);
    const theirsKept = listBackups(path.join(target, "backups")).map((n) => read(path.join(target, "backups", n)));
    expect(theirsKept.some((d) => Array.isArray(d) && d[0]?.id === "theirs")).toBe(true);
    expect(listBackups(path.join(target, "backups"), "category-rules")).toHaveLength(1);
  });

  it("use-existing switches without copying", async () => {
    seedDefault();
    const target = path.join(cloud, "Linkdeck");
    write(path.join(target, "bookmarks.json"), [bm("theirs")]);
    const r = await moveData(target, "use-existing");
    expect(!r.needsChoice && r.mode).toBe("switched");
    expect((await readBookmarks()).map((b) => b.id)).toEqual(["theirs"]);
    expect(fs.existsSync(path.join(target, "category-rules.json"))).toBe(false);
  });

  it("moves back to the project folder and drops the config", async () => {
    seedDefault();
    const target = path.join(cloud, "Linkdeck");
    await moveData(target);
    const back = await moveData(defaultDataDir());
    expect(!back.needsChoice && back.previous).toBe(null); // cloud folder is left untouched
    expect(dataSource()).toBe("default");
    expect(fs.existsSync(path.join(root, "linkdeck.config.json"))).toBe(false);
    expect((await readBookmarks()).map((b) => b.id)).toEqual(["a", "b"]);
    expect(fs.existsSync(path.join(target, "bookmarks.json"))).toBe(true);
  });

  it("can only switch (not copy) away from an unavailable folder", async () => {
    writeConfig(path.join(cloud, "Gone"));
    const elsewhere = path.join(cloud, "Elsewhere");
    await expect(moveData(elsewhere)).rejects.toBeInstanceOf(StorageUnavailableError);
    write(path.join(elsewhere, "bookmarks.json"), [bm("e")]);
    const r = await moveData(elsewhere, "use-existing");
    expect(!r.needsChoice && r.mode).toBe("switched");
    expect((await readBookmarks()).map((b) => b.id)).toEqual(["e"]);
  });

  it("refuses when the folder comes from LINKDECK_DATA_DIR", async () => {
    vi.stubEnv("LINKDECK_DATA_DIR", cloud);
    await expect(moveData(path.join(cloud, "x"))).rejects.toThrow(/LINKDECK_DATA_DIR/);
  });

  it("reports status with conflicts and summary", async () => {
    seedDefault();
    write(path.join(defaultDataDir(), "bookmarks (1).json"), [bm("a"), bm("c")]);
    const s = storageStatus();
    expect(s.isDefault).toBe(true);
    expect(s.available).toBe(true);
    expect(s.summary.bookmarks).toBe(2);
    expect(s.conflicts).toEqual([expect.objectContaining({ file: "bookmarks (1).json", kind: "bookmarks", count: 2, valid: true, wouldAdd: 1 })]);
  });
});

describe("conflict copies", () => {
  it("finds conflict copies under the naming styles cloud drives use", () => {
    seedDefault();
    const d = defaultDataDir();
    for (const n of ["bookmarks (1).json", "bookmarks 2.json", "bookmarks-MacBook-Pro.json", "bookmarks (Balu's conflicted copy 2026-10-27).json", "category-rules (1).json"]) {
      write(path.join(d, n), n.startsWith("bookmarks") ? [bm("z")] : { "z.com": "Z" });
    }
    write(path.join(d, "bookmarks.json.123.456.abc.tmp"), "[]");
    write(path.join(d, "bookmarks (2).json"), "{ broken");
    const found = findConflicts();
    expect(found.map((c) => c.file).sort()).toEqual([
      "bookmarks (1).json", "bookmarks (2).json", "bookmarks (Balu's conflicted copy 2026-10-27).json",
      "bookmarks 2.json", "bookmarks-MacBook-Pro.json", "category-rules (1).json",
    ]);
    expect(found.find((c) => c.file === "bookmarks (2).json")!.valid).toBe(false);
  });

  it("merges: keeps everything, mine wins, same URL isn't duplicated, usage combined", () => {
    const mine = [
      bm("a", { title: "Mine", visitCount: 1, chromeUsage: { m1: { visits: 5, lastVisitAt: "2026-10-27T10:00:00.000Z" } }, chromeVisitCount: 5 }),
      bm("b"),
    ];
    const theirs = [
      bm("a", { title: "Theirs", visitCount: 4, chromeUsage: { m2: { visits: 3, lastVisitAt: "2026-10-27T11:00:00.000Z" } } }),
      bm("c"),
      bm("d", { url: "https://b.example.com/" }),
    ];
    const merged = mergeBookmarks(mine, theirs);
    expect(merged.map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(merged[0]).toMatchObject({ title: "Mine", visitCount: 4, chromeVisitCount: 8, lastChromeVisitAt: "2026-10-27T11:00:00.000Z" });
  });

  it("resolves by merging, keeping mine or keeping theirs — and archives the copy", async () => {
    seedDefault();
    const d = defaultDataDir();
    write(path.join(d, "bookmarks (1).json"), [bm("a"), bm("c")]);
    await resolveConflict("bookmarks (1).json", "merge");
    expect((await readBookmarks()).map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(fs.existsSync(path.join(d, "bookmarks (1).json"))).toBe(false);

    write(path.join(d, "bookmarks 2.json"), [bm("t")]);
    await resolveConflict("bookmarks 2.json", "keep-theirs");
    expect((await readBookmarks()).map((b) => b.id)).toEqual(["t"]);

    write(path.join(d, "category-rules (1).json"), { "z.com": "Z", "figma.com": "Other" });
    await resolveConflict("category-rules (1).json", "merge");
    expect(await readCategoryRules()).toEqual({ "z.com": "Z", "figma.com": "Design" });

    write(path.join(d, "bookmarks-Other.json"), [bm("o")]);
    await resolveConflict("bookmarks-Other.json", "keep-mine");
    expect((await readBookmarks()).map((b) => b.id)).toEqual(["t"]);
    // every conflict copy and every replaced version is restorable
    const backups = listBackups(path.join(d, "backups")).map((n) => read(path.join(d, "backups", n)).map((b: Bookmark) => b.id).join(","));
    expect(backups).toEqual(expect.arrayContaining(["a,c", "t", "o", "a,b", "a,b,c"]));
    expect(findConflicts()).toEqual([]);
  });

  it("rejects unknown files and actions", async () => {
    seedDefault();
    await expect(resolveConflict("../bookmarks.json", "merge")).rejects.toThrow(/no longer exists/);
    await expect(resolveConflict("bookmarks (1).json", "explode")).rejects.toThrow(/Unknown action/);
  });
});

describe("per-Mac usage", () => {
  it("adds up each Mac's Chrome counts instead of overwriting them", async () => {
    seedDefault();
    const at = (h: number) => new Date(Date.UTC(2026, 9, 27, h)).toISOString();
    await setChromeUsage([{ id: "a", visits: 10, lastVisitAt: at(9) }], { id: "mac-1", name: "Work Mac" });
    await setChromeUsage([{ id: "a", visits: 4, lastVisitAt: at(12) }], { id: "mac-2", name: "Home Mac" });
    await setChromeUsage([{ id: "a", visits: 12, lastVisitAt: at(10) }], { id: "mac-1", name: "Work Mac" });
    const a = (await readBookmarks()).find((b) => b.id === "a")!;
    expect(a.chromeVisitCount).toBe(16);
    expect(a.lastChromeVisitAt).toBe(at(12));
    expect(a.chromeUsage).toEqual({
      "mac-1": { visits: 12, lastVisitAt: at(10), machine: "Work Mac" },
      "mac-2": { visits: 4, lastVisitAt: at(12), machine: "Home Mac" },
    });
    await setChromeUsage([{ id: "a", visits: 0, lastVisitAt: null }], { id: "mac-2", name: "Home Mac" });
    expect((await readBookmarks()).find((b) => b.id === "a")!.chromeVisitCount).toBe(12);
  });
});
