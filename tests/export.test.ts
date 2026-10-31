/**
 * Tests for lib/export.ts
 */

import { describe, it, expect } from "vitest";
import { toJsonExport, toNetscapeHtml } from "@/lib/export";
import type { Bookmark } from "@/lib/types";

const b = (o: Partial<Bookmark>): Bookmark => ({
  id: "x", url: "https://a.com", title: "A", description: "", category: "General", tags: [], favicon: "",
  addedAt: "2026-01-01T00:00:00Z", pinned: false, ...o,
});

describe("toNetscapeHtml", () => {
  const html = toNetscapeHtml([
    b({ id: "1", title: "Zeta & <Co>", url: "https://z.com/?a=1&b=2", category: "Work", tags: ["t1", "t2"], description: 'say "hi"' }),
    b({ id: "2", title: "Pinned one", url: "https://p.com", category: "Work", pinned: true }),
    b({ id: "3", title: "Other", url: "https://o.com", category: "Alpha" }),
  ], new Date("2026-10-27T00:00:00Z"));

  it("produces a Netscape bookmark file with one folder per category", () => {
    expect(html.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1>")).toBe(true);
    expect(html).toContain(">Linkdeck</H3>");
    expect(html.indexOf(">Alpha</H3>")).toBeLessThan(html.indexOf(">Work</H3>"));
    expect(html.indexOf("Pinned one")).toBeLessThan(html.indexOf("Zeta"));
  });

  it("escapes titles, URLs, tags and descriptions", () => {
    expect(html).toContain('HREF="https://z.com/?a=1&amp;b=2"');
    expect(html).toContain(">Zeta &amp; &lt;Co&gt;</A>");
    expect(html).toContain('TAGS="t1,t2"');
    expect(html).toContain("<DD>say &quot;hi&quot;");
    expect(html).toContain(`ADD_DATE="${Date.parse("2026-01-01T00:00:00Z") / 1000}"`);
  });
});

describe("toJsonExport", () => {
  it("includes all bookmarks, rules and metadata", () => {
    const out = toJsonExport([b({})], { "a.com": "Work" }, new Date("2026-10-27T00:00:00Z"));
    expect(out).toEqual({
      app: "linkdeck", version: 1, exportedAt: "2026-10-27T00:00:00.000Z",
      bookmarks: [b({})], categoryRules: { "a.com": "Work" },
    });
  });
});
