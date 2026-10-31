/**
 * Tests for lib/bookmark-input.ts and lib/url.ts
 */

import { describe, it, expect } from "vitest";
import {
  parseBookmarkUpdate,
  parseBulkBody,
  parseCategorizeBody,
  parseLinkCheckBody,
  parseNewBookmark,
  parseReorder,
  parseRuleHost,
  parseRuleInput,
  parseTags,
} from "@/lib/bookmark-input";
import { isHttpUrl, normalizeUrl } from "@/lib/url";

describe("normalizeUrl", () => {
  it("treats host case, trailing slashes and default ports as equal", () => {
    expect(normalizeUrl("https://Example.com/")).toBe(normalizeUrl("https://example.com"));
    expect(normalizeUrl("https://example.com/docs/")).toBe(normalizeUrl("https://example.com/docs"));
    expect(normalizeUrl("https://example.com:443/a")).toBe(normalizeUrl("https://example.com/a"));
    expect(normalizeUrl("https://example.com/a#")).toBe(normalizeUrl("https://example.com/a"));
  });

  it("keeps path case, query and fragment", () => {
    expect(normalizeUrl("https://example.com/Docs")).not.toBe(normalizeUrl("https://example.com/docs"));
    expect(normalizeUrl("https://example.com/?a=1")).not.toBe(normalizeUrl("https://example.com/?a=2"));
    expect(normalizeUrl("https://app.com/#/x")).not.toBe(normalizeUrl("https://app.com/#/y"));
  });

  it("returns trimmed input when not a URL", () => {
    expect(normalizeUrl("  not a url ")).toBe("not a url");
  });
});

describe("isHttpUrl", () => {
  it("accepts http(s) only", () => {
    expect(isHttpUrl("https://a.com")).toBe(true);
    expect(isHttpUrl("http://localhost:3000")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("chrome://settings")).toBe(false);
    expect(isHttpUrl("a.com")).toBe(false);
  });
});

describe("parseBookmarkUpdate", () => {
  it("accepts and trims editable fields", () => {
    const r = parseBookmarkUpdate({
      title: "  T  ", url: " https://a.com ", description: " d ", category: " Dev ",
      tags: [" x ", "X", "", "y"], pinned: true,
    });
    expect(r).toEqual({
      ok: true,
      value: { title: "T", url: "https://a.com", description: "d", category: "Dev", tags: ["x", "y"], pinned: true },
    });
  });

  it("rejects non-editable or unknown fields", () => {
    for (const key of ["id", "favicon", "addedAt", "sortOrder", "foo"]) {
      const r = parseBookmarkUpdate({ [key]: "x" });
      expect(r.ok).toBe(false);
    }
  });

  it("rejects wrong types and empty required values", () => {
    expect(parseBookmarkUpdate({ title: "" }).ok).toBe(false);
    expect(parseBookmarkUpdate({ title: 5 }).ok).toBe(false);
    expect(parseBookmarkUpdate({ category: "  " }).ok).toBe(false);
    expect(parseBookmarkUpdate({ pinned: "yes" }).ok).toBe(false);
    expect(parseBookmarkUpdate({ tags: "a,b" }).ok).toBe(false);
    expect(parseBookmarkUpdate({ url: "ftp://a.com" }).ok).toBe(false);
  });

  it("allows an empty description", () => {
    expect(parseBookmarkUpdate({ description: "" })).toEqual({ ok: true, value: { description: "" } });
  });

  it("rejects non-objects and empty updates", () => {
    expect(parseBookmarkUpdate(null).ok).toBe(false);
    expect(parseBookmarkUpdate([]).ok).toBe(false);
    expect(parseBookmarkUpdate({}).ok).toBe(false);
  });

  it("enforces length limits", () => {
    expect(parseBookmarkUpdate({ title: "x".repeat(301) }).ok).toBe(false);
  });
});

describe("parseTags", () => {
  it("limits the number of tags", () => {
    expect(parseTags(Array.from({ length: 21 }, (_, i) => `t${i}`)).ok).toBe(false);
  });
});

describe("parseNewBookmark", () => {
  it("requires a valid http(s) url", () => {
    expect(parseNewBookmark({}).ok).toBe(false);
    expect(parseNewBookmark({ url: "javascript:void(0)" }).ok).toBe(false);
    expect(parseNewBookmark({ url: "https://a.com" })).toEqual({ ok: true, value: { url: "https://a.com" } });
  });

  it("keeps optional fields and drops blank ones", () => {
    expect(parseNewBookmark({ url: "https://a.com", title: " T ", description: " ", faviconUrl: "data:x" }))
      .toEqual({ ok: true, value: { url: "https://a.com", title: "T" } });
    expect(parseNewBookmark({ url: "https://a.com", description: "D", faviconUrl: "https://a.com/f.ico" }))
      .toEqual({ ok: true, value: { url: "https://a.com", description: "D", faviconUrl: "https://a.com/f.ico" } });
  });
});

describe("parseReorder", () => {
  it("accepts items with id, sortOrder and optional category", () => {
    expect(parseReorder({ items: [{ id: "a", sortOrder: 0 }, { id: "b", sortOrder: 10, category: "Dev" }] }))
      .toEqual({ ok: true, value: [{ id: "a", sortOrder: 0 }, { id: "b", sortOrder: 10, category: "Dev" }] });
  });

  it("rejects malformed bodies", () => {
    expect(parseReorder({ orderedIds: ["a"] }).ok).toBe(false);
    expect(parseReorder({ items: [{ id: "a" }] }).ok).toBe(false);
    expect(parseReorder({ items: [{ sortOrder: 1 }] }).ok).toBe(false);
    expect(parseReorder({ items: [{ id: "a", sortOrder: 1, category: "" }] }).ok).toBe(false);
  });
});

describe("parseRuleHost", () => {
  it("normalizes and validates hostnames", () => {
    expect(parseRuleHost(" WWW.Figma.com ")).toEqual({ ok: true, value: "figma.com" });
    expect(parseRuleHost("a.b-c.io").ok).toBe(true);
    for (const bad of [null, "", "http://figma.com", "figma.com/x", "a b.com", "../etc"]) {
      expect(parseRuleHost(bad).ok).toBe(false);
    }
  });
});

describe("parseRuleInput", () => {
  it("requires an http(s) url and a category", () => {
    expect(parseRuleInput({ url: "https://figma.com/x", category: " Design " }))
      .toEqual({ ok: true, value: { url: "https://figma.com/x", category: "Design" } });
    expect(parseRuleInput({ url: "figma.com", category: "Design" }).ok).toBe(false);
    expect(parseRuleInput({ url: "https://figma.com", category: "" }).ok).toBe(false);
  });
});

describe("parseCategorizeBody", () => {
  it("accepts items and an optional remember flag", () => {
    expect(parseCategorizeBody({ items: [{ id: "a", category: " IBM " }] }))
      .toEqual({ ok: true, value: { items: [{ id: "a", category: "IBM" }], remember: false } });
    expect(parseCategorizeBody({ items: [], remember: true }))
      .toEqual({ ok: true, value: { items: [], remember: true } });
  });

  it("rejects malformed bodies", () => {
    expect(parseCategorizeBody({}).ok).toBe(false);
    expect(parseCategorizeBody({ items: [{ id: "a" }] }).ok).toBe(false);
    expect(parseCategorizeBody({ items: [{ category: "x" }] }).ok).toBe(false);
    expect(parseCategorizeBody({ items: [], remember: "yes" }).ok).toBe(false);
  });
});

describe("parseBulkBody", () => {
  it("accepts each action and dedupes ids", () => {
    expect(parseBulkBody({ action: "pin", ids: ["a", "a", "b"] })).toEqual({ ok: true, value: { action: "pin", ids: ["a", "b"] } });
    expect(parseBulkBody({ action: "move", ids: ["a"], category: " Work " }))
      .toEqual({ ok: true, value: { action: "move", ids: ["a"], category: "Work" } });
    expect(parseBulkBody({ action: "delete", ids: ["a"] }).ok).toBe(true);
  });

  it("rejects bad input", () => {
    expect(parseBulkBody({ action: "nuke", ids: ["a"] }).ok).toBe(false);
    expect(parseBulkBody({ action: "pin", ids: [] }).ok).toBe(false);
    expect(parseBulkBody({ action: "pin", ids: [1] }).ok).toBe(false);
    expect(parseBulkBody({ action: "move", ids: ["a"] }).ok).toBe(false);
  });
});

describe("parseLinkCheckBody", () => {
  it("allows an empty body or a list of ids", () => {
    expect(parseLinkCheckBody({})).toEqual({ ok: true, value: {} });
    expect(parseLinkCheckBody({ ids: ["a"] })).toEqual({ ok: true, value: { ids: ["a"] } });
    expect(parseLinkCheckBody({ ids: [] }).ok).toBe(false);
  });
});
