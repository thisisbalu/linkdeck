/**
 * Tests for lib/usage.ts, usage-aware sorting/search, parseChromeUsageBody,
 * and the extension's history matcher (chrome-extension/usage.js).
 */

import { describe, it, expect, vi } from "vitest";
import { lastUsedAt, usesOf } from "@/lib/usage";
import { comparatorFor } from "@/lib/sort";
import { searchBookmarks } from "@/lib/search";
import { parseChromeUsageBody } from "@/lib/bookmark-input";
import { validateBookmarks } from "@/lib/restore";
import type { Bookmark } from "@/lib/types";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ext = require("../chrome-extension/usage.js") as {
  normalizeForUsage: (u: string) => string | null;
  countVisits: (v: { visitTime: number; transition: string }[], since: number) => { count: number; last: number };
  collectUsage: (
    b: { id: string; url: string }[],
    api: { search: (q: { text: string }) => Promise<{ url: string }[]>; getVisits: (q: { url: string }) => Promise<{ visitTime: number; transition: string }[]> },
    o?: { days?: number; now?: number }
  ) => Promise<{ id: string; visits: number; lastVisitAt: string | null }[]>;
};

const b = (id: string, o: Partial<Bookmark> = {}): Bookmark => ({
  id, url: `https://${id}.com`, title: id, description: "", category: "X", tags: [], favicon: "",
  addedAt: "2026-01-01T00:00:00.000Z", pinned: false, ...o,
});

describe("usesOf / lastUsedAt", () => {
  it("takes the larger count (portal opens are also Chrome visits) and the latest time", () => {
    expect(usesOf(b("a"))).toBe(0);
    expect(usesOf(b("a", { visitCount: 3, chromeVisitCount: 10 }))).toBe(10);
    expect(usesOf(b("a", { visitCount: 4, chromeVisitCount: 1 }))).toBe(4);
    expect(lastUsedAt(b("a", { lastVisitedAt: "2026-10-01T00:00:00Z", lastChromeVisitAt: "2026-10-20T00:00:00Z" })))
      .toBe(Date.parse("2026-10-20T00:00:00Z"));
    expect(lastUsedAt(b("a"))).toBe(0);
  });

  it("drives Most used / Recent ordering and is:unused", () => {
    const list = [
      b("portal", { visitCount: 5, lastVisitedAt: "2026-10-27T10:00:00Z" }),
      b("chrome", { chromeVisitCount: 20, lastChromeVisitAt: "2026-10-20T10:00:00Z" }),
      b("never"),
    ];
    expect([...list].sort(comparatorFor("most-used")).map((x) => x.id)).toEqual(["chrome", "portal", "never"]);
    expect([...list].sort(comparatorFor("recent")).map((x) => x.id)).toEqual(["portal", "chrome", "never"]);
    expect(searchBookmarks(list, "is:unused").map((x) => x.id)).toEqual(["never"]);
  });

  it("keeps Chrome usage fields through backup/restore validation", () => {
    const r = validateBookmarks([{ ...b("a"), chromeVisitCount: 7.9, lastChromeVisitAt: "2026-10-20T10:00:00.000Z" }]);
    expect(r.ok && r.value[0]).toMatchObject({ chromeVisitCount: 7, lastChromeVisitAt: "2026-10-20T10:00:00.000Z" });
  });
});

describe("parseChromeUsageBody", () => {
  it("accepts counts with times and normalizes dates", () => {
    expect(parseChromeUsageBody({ items: [{ id: "a", visits: 3, lastVisitAt: "2026-10-27T10:00:00Z" }, { id: "b", visits: 0, lastVisitAt: null }] }))
      .toEqual({ ok: true, value: [{ id: "a", visits: 3, lastVisitAt: "2026-10-27T10:00:00.000Z" }, { id: "b", visits: 0, lastVisitAt: null }] });
  });

  it("rejects bad input", () => {
    expect(parseChromeUsageBody({}).ok).toBe(false);
    expect(parseChromeUsageBody({ items: [{ id: "a", visits: -1, lastVisitAt: null }] }).ok).toBe(false);
    expect(parseChromeUsageBody({ items: [{ id: "a", visits: 1.5, lastVisitAt: "2026-10-27T10:00:00Z" }] }).ok).toBe(false);
    expect(parseChromeUsageBody({ items: [{ id: "a", visits: 2, lastVisitAt: null }] }).ok).toBe(false);
    expect(parseChromeUsageBody({ items: [{ id: "a", visits: 2, lastVisitAt: "nope" }] }).ok).toBe(false);
  });
});

describe("extension history matcher", () => {
  it("normalizes trailing slashes, fragments, host case and default ports", () => {
    const n = ext.normalizeForUsage;
    expect(n("https://GitHub.com/org/repo/")).toBe(n("https://github.com/org/repo"));
    expect(n("https://github.com/org/repo#readme")).toBe(n("https://github.com/org/repo"));
    expect(n("https://a.com:443/x")).toBe(n("https://a.com/x"));
    expect(n("https://a.com/x?q=1")).not.toBe(n("https://a.com/x?q=2"));
    expect(n("https://a.com/x/sub")).not.toBe(n("https://a.com/x"));
    expect(n("chrome://settings")).toBeNull();
  });

  it("keeps single-page-app hash routes as separate pages", () => {
    const n = ext.normalizeForUsage;
    expect(n("https://w3.ibm.com/#/apps/category/all")).not.toBe(n("https://w3.ibm.com/"));
    expect(n("https://w3.ibm.com/#/apps/category/all/")).toBe(n("https://w3.ibm.com/#/apps/category/all"));
    expect(n("https://app.com/#!/inbox")).not.toBe(n("https://app.com/"));
    expect(n("https://app.com/#/")).toBe(n("https://app.com/"));
    expect(n("https://cbea.ms/git-commit#seven-rules")).toBe(n("https://cbea.ms/git-commit"));
  });

  it("counts only real visits inside the window", () => {
    const visits = [
      { visitTime: 100, transition: "link" },
      { visitTime: 200, transition: "typed" },
      { visitTime: 300, transition: "reload" },
      { visitTime: 400, transition: "auto_subframe" },
      { visitTime: 50, transition: "link" },
    ];
    expect(ext.countVisits(visits, 90)).toEqual({ count: 2, last: 200 });
  });

  it("collects usage per bookmark from history, matching exact pages only", async () => {
    const now = Date.parse("2026-10-27T12:00:00Z");
    const day = 86_400_000;
    const history: Record<string, { visitTime: number; transition: string }[]> = {
      "https://github.com/org/repo": [{ visitTime: now - day, transition: "link" }, { visitTime: now - 2 * day, transition: "typed" }],
      "https://github.com/org/repo/#readme": [{ visitTime: now - 3600_000, transition: "link" }],
      "https://github.com/org/repo/issues/1": [{ visitTime: now - 10, transition: "link" }],
      "https://jira.example.com/board": [{ visitTime: now - 200 * day, transition: "link" }],
    };
    const api = {
      search: vi.fn(async ({ text }: { text: string }) => Object.keys(history).filter((u) => u.includes(text)).map((url) => ({ url }))),
      getVisits: vi.fn(async ({ url }: { url: string }) => history[url] ?? []),
    };
    const out = await ext.collectUsage(
      [
        { id: "repo", url: "https://github.com/org/repo" },
        { id: "repo-dup", url: "https://github.com/org/repo/" },
        { id: "jira", url: "https://jira.example.com/board" },
        { id: "bad", url: "javascript:alert(1)" },
      ],
      api,
      { now, days: 90 }
    );
    expect(out).toEqual([
      { id: "repo", visits: 3, lastVisitAt: new Date(now - 3600_000).toISOString() },
      { id: "repo-dup", visits: 3, lastVisitAt: new Date(now - 3600_000).toISOString() },
      { id: "jira", visits: 0, lastVisitAt: null },
    ]);
    // one history search per site, never for unrelated sites
    expect(api.search).toHaveBeenCalledTimes(2);
  });
});
