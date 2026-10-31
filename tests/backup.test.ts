/**
 * Tests for lib/backup.ts (uses a real temp directory)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { backupIfDue, backupFileName, listBackups } from "@/lib/backup";

let dir: string;
let source: string;
let backups: string;
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "linkdeck-backup-"));
  source = path.join(dir, "bookmarks.json");
  backups = path.join(dir, "backups");
  fs.writeFileSync(source, "[1]");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("backupIfDue", () => {
  it("does nothing when the source file does not exist", () => {
    fs.unlinkSync(source);
    expect(backupIfDue(source, backups)).toBeNull();
    expect(fs.existsSync(backups)).toBe(false);
  });

  it("creates the first snapshot with the source contents", () => {
    const now = new Date("2026-10-27T10:00:00.000Z");
    const created = backupIfDue(source, backups, { now });
    expect(created).toBe(path.join(backups, backupFileName(now)));
    expect(fs.readFileSync(created!, "utf-8")).toBe("[1]");
  });

  it("skips when the newest snapshot is within the interval", () => {
    const t0 = new Date("2026-10-27T10:00:00.000Z");
    backupIfDue(source, backups, { now: t0 });
    expect(backupIfDue(source, backups, { now: new Date(t0.getTime() + HOUR - 1) })).toBeNull();
    expect(backupIfDue(source, backups, { now: new Date(t0.getTime() + HOUR) })).not.toBeNull();
    expect(listBackups(backups)).toHaveLength(2);
  });

  it("keeps only the newest N snapshots", () => {
    const t0 = Date.parse("2026-10-27T00:00:00.000Z");
    for (let i = 0; i < 6; i++) {
      backupIfDue(source, backups, { now: new Date(t0 + i * HOUR), keep: 3 });
    }
    const names = listBackups(backups);
    expect(names).toEqual([
      backupFileName(new Date(t0 + 5 * HOUR)),
      backupFileName(new Date(t0 + 4 * HOUR)),
      backupFileName(new Date(t0 + 3 * HOUR)),
    ]);
  });

  it("keeps separate histories per prefix", () => {
    const rules = path.join(dir, "category-rules.json");
    fs.writeFileSync(rules, "{}");
    const now = new Date("2026-10-27T10:00:00.000Z");
    backupIfDue(source, backups, { now });
    // Same hour, different prefix: still due, and pruning one never touches the other.
    expect(backupIfDue(rules, backups, { now, prefix: "category-rules", keep: 1 })).not.toBeNull();
    expect(listBackups(backups)).toEqual([backupFileName(now)]);
    expect(listBackups(backups, "category-rules")).toEqual([backupFileName(now, "category-rules")]);
    expect(fs.readFileSync(path.join(backups, backupFileName(now, "category-rules")), "utf-8")).toBe("{}");
  });

  it("never overwrites a snapshot taken in the same millisecond", () => {
    const now = new Date("2026-10-27T10:00:00.000Z");
    const first = backupIfDue(source, backups, { now, intervalMs: 0 });
    fs.writeFileSync(source, "[2]");
    const second = backupIfDue(source, backups, { now, intervalMs: 0 });
    expect(second).not.toBe(first);
    expect(fs.readFileSync(first!, "utf-8")).toBe("[1]");
    expect(fs.readFileSync(second!, "utf-8")).toBe("[2]");
    expect(listBackups(backups)).toEqual([path.basename(second!), path.basename(first!)]);
  });

  it("ignores unrelated files in the backup folder", () => {
    fs.mkdirSync(backups);
    fs.writeFileSync(path.join(backups, "notes.txt"), "keep me");
    backupIfDue(source, backups, { now: new Date(), keep: 1 });
    expect(fs.existsSync(path.join(backups, "notes.txt"))).toBe(true);
  });
});
