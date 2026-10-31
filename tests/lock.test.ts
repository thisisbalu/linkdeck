/**
 * Tests for lib/lock.ts — cross-process file lock
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { withLock, lockFilePath } from "@/lib/lock";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("withLock", () => {
  it("creates the lock file while running and removes it afterwards", async () => {
    const file = lockFilePath("t1");
    let existedDuring = false;
    await withLock("t1", async () => { existedDuring = fs.existsSync(file); });
    expect(existedDuring).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("releases the lock when the operation throws", async () => {
    await expect(withLock("t2", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(fs.existsSync(lockFilePath("t2"))).toBe(false);
    await expect(withLock("t2", async () => 42)).resolves.toBe(42);
  });

  it("waits for a lock held by another live process", async () => {
    const file = lockFilePath("t3");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // A real, live process "owns" the lock.
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 5000)"]);
    fs.writeFileSync(file, `${child.pid}:${Date.now()}:x`);

    let ran = false;
    const op = withLock("t3", async () => { ran = true; });
    await sleep(150);
    expect(ran).toBe(false);

    fs.unlinkSync(file);
    await op;
    expect(ran).toBe(true);
    child.kill();
  });

  it("takes over a lock left by a dead process", async () => {
    const file = lockFilePath("t4");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const child = spawn(process.execPath, ["-e", ""]);
    await new Promise((r) => child.on("exit", r));
    fs.writeFileSync(file, `${child.pid}:${Date.now()}:x`);

    await expect(withLock("t4", async () => "ok")).resolves.toBe("ok");
  });

  it("takes over a lock older than the stale timeout", async () => {
    const file = lockFilePath("t5");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${process.pid}:0:x`);
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(file, old, old);

    await expect(withLock("t5", async () => "ok")).resolves.toBe("ok");
  });

  it("serializes overlapping operations across separate processes", async () => {
    // Two child processes each do 20 locked read-increment-write cycles on one counter.
    const dir = process.env.LINKDECK_DATA_DIR!;
    const counter = path.join(dir, "counter.txt");
    fs.writeFileSync(counter, "0");
    const script = `
      const fs = require("fs");
      const lock = ${JSON.stringify(lockFilePath("t6"))};
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      (async () => {
        for (let i = 0; i < 20; i++) {
          for (;;) { try { fs.writeFileSync(lock, process.pid + ":" + Date.now(), { flag: "wx" }); break; } catch { await sleep(2); } }
          const n = Number(fs.readFileSync(${JSON.stringify(counter)}, "utf-8"));
          await sleep(1);
          fs.writeFileSync(${JSON.stringify(counter)}, String(n + 1));
          fs.unlinkSync(lock);
        }
      })();
    `;
    // One external process using the same protocol + this process via withLock.
    const child = spawn(process.execPath, ["-e", script]);
    const ours = (async () => {
      for (let i = 0; i < 20; i++) {
        await withLock("t6", async () => {
          const n = Number(fs.readFileSync(counter, "utf-8"));
          await sleep(1);
          fs.writeFileSync(counter, String(n + 1));
        });
      }
    })();
    await Promise.all([ours, new Promise((r) => child.on("exit", r))]);
    expect(fs.readFileSync(counter, "utf-8")).toBe("40");
  }, 20_000);
});
