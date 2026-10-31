/**
 * Tests for lib/link-check.ts and lib/sort.ts
 */

import { describe, it, expect, vi } from "vitest";
import { checkUrl, classifyError, classifyResponse, mapConcurrent } from "@/lib/link-check";
import { comparatorFor } from "@/lib/sort";
import type { Bookmark } from "@/lib/types";

const res = (status: number) => ({ status, body: null }) as unknown as Response;
const now = () => new Date("2026-10-27T12:00:00Z");

describe("classify", () => {
  it("maps status codes", () => {
    expect(classifyResponse(200).state).toBe("ok");
    expect(classifyResponse(301).state).toBe("ok");
    expect(classifyResponse(404).state).toBe("broken");
    expect(classifyResponse(410).state).toBe("broken");
    expect(classifyResponse(401).state).toBe("restricted");
    expect(classifyResponse(403).state).toBe("restricted");
    expect(classifyResponse(429).state).toBe("ok");
    expect(classifyResponse(503).state).toBe("unreachable");
  });

  it("maps network errors", () => {
    expect(classifyError({ cause: { code: "ENOTFOUND" } }).detail).toMatch(/DNS/);
    expect(classifyError({ name: "TimeoutError" }).detail).toBe("Timed out");
    expect(classifyError({ cause: { code: "ECONNREFUSED" } }).state).toBe("unreachable");
    expect(classifyError(new Error("x")).state).toBe("unreachable");
  });
});

describe("checkUrl", () => {
  it("uses HEAD when it succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200));
    const s = await checkUrl("https://a.com", { fetchImpl, now });
    expect(s).toEqual({ url: "https://a.com", state: "ok", code: 200, detail: "OK (200)", checkedAt: "2026-10-27T12:00:00.000Z" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1].method).toBe("HEAD");
  });

  it("falls back to GET when HEAD fails or errors", async () => {
    const f1 = vi.fn().mockResolvedValueOnce(res(405)).mockResolvedValueOnce(res(200));
    expect((await checkUrl("https://a.com", { fetchImpl: f1, now })).state).toBe("ok");
    expect(f1.mock.calls[1][1].method).toBe("GET");

    const f2 = vi.fn().mockRejectedValueOnce(new Error("head blocked")).mockResolvedValueOnce(res(404));
    expect((await checkUrl("https://a.com", { fetchImpl: f2, now })).state).toBe("broken");
  });

  it("treats 404s from code hosts as possibly private", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(404));
    expect((await checkUrl("https://github.com/org/private-repo", { fetchImpl, now })).state).toBe("restricted");
    expect((await checkUrl("https://gist.github.com/x", { fetchImpl, now })).state).toBe("restricted");
    expect((await checkUrl("https://notgithub.com/x", { fetchImpl, now })).state).toBe("broken");
  });

  it("reports network failures", async () => {
    const err = Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    const fetchImpl = vi.fn().mockRejectedValue(err);
    const s = await checkUrl("https://nope.invalid", { fetchImpl, now });
    expect(s.state).toBe("unreachable");
    expect(s.code).toBeUndefined();
  });
});

describe("mapConcurrent", () => {
  it("never exceeds the concurrency limit and yields every result", async () => {
    let active = 0, peak = 0;
    const out: number[] = [];
    for await (const v of mapConcurrent([5, 1, 4, 2, 3, 1, 2], 3, async (ms) => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, ms * 3));
      active--;
      return ms;
    })) out.push(v);
    expect(peak).toBe(3);
    expect(out.sort()).toEqual([1, 1, 2, 2, 3, 4, 5]);
  });
});

describe("comparatorFor", () => {
  const b = (id: string, o: Partial<Bookmark>): Bookmark => ({
    id, url: "", title: id, description: "", category: "", tags: [], favicon: "",
    addedAt: "2026-01-01T00:00:00Z", pinned: false, ...o,
  });
  const list = [
    b("a", { sortOrder: 0 }),
    b("b", { sortOrder: 10, visitCount: 3, lastVisitedAt: "2026-10-01T00:00:00Z" }),
    b("c", { sortOrder: 20, visitCount: 7, lastVisitedAt: "2026-09-01T00:00:00Z" }),
    b("d", { sortOrder: 30, visitCount: 3, lastVisitedAt: "2026-10-20T00:00:00Z" }),
  ];
  const order = (mode: Parameters<typeof comparatorFor>[0]) => [...list].sort(comparatorFor(mode)).map((x) => x.id);

  it("sorts manually, by usage and by recency", () => {
    expect(order("manual")).toEqual(["a", "b", "c", "d"]);
    expect(order("most-used")).toEqual(["c", "d", "b", "a"]);
    expect(order("recent")).toEqual(["d", "b", "c", "a"]);
  });
});
