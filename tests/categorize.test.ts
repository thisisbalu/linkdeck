/**
 * Tests for lib/categorize.ts and lib/category-rules.ts helpers
 */

import { describe, it, expect } from "vitest";
import { suggestCategory } from "@/lib/categorize";
import { lookupRule, ruleHost } from "@/lib/category-rules";
import type { Bookmark } from "@/lib/types";

function bm(url: string, category: string, id = crypto.randomUUID()): Bookmark {
  return { id, url, title: "t", description: "", category, tags: [], favicon: "", addedAt: "2026-01-01T00:00:00Z", pinned: false };
}

const base = { rules: {}, bookmarks: [] as Bookmark[], builtInCategory: "General" };

describe("ruleHost / lookupRule", () => {
  it("normalizes host and strips www", () => {
    expect(ruleHost("https://WWW.Figma.com/file/x")).toBe("figma.com");
    expect(ruleHost("not a url")).toBe("");
  });

  it("matches exact hosts only", () => {
    const rules = { "figma.com": "Design" };
    expect(lookupRule(rules, "https://www.figma.com/x")).toBe("Design");
    expect(lookupRule(rules, "https://help.figma.com/x")).toBeUndefined();
    expect(lookupRule(rules, "https://toString.com")).toBeUndefined();
    expect(lookupRule({}, "https://constructor")).toBeUndefined();
  });
});

describe("suggestCategory", () => {
  it("prefers your site rule over everything", () => {
    const s = suggestCategory("https://figma.com/a", "Figma", {
      ...base,
      rules: { "figma.com": "Design" },
      builtInCategory: "Documents",
    });
    expect(s).toEqual({ category: "Design", reason: "Your rule for figma.com" });
  });

  it("uses a built-in category when it is not General", () => {
    expect(suggestCategory("https://x.com", "x", { ...base, builtInCategory: "GitHub" })?.category).toBe("GitHub");
  });

  it("learns from other bookmarks on the same site, ignoring General and itself", () => {
    const bookmarks = [
      bm("https://w3.example.com/a", "Intranet"),
      bm("https://w3.example.com/b", "Intranet"),
      bm("https://w3.example.com/c", "HR"),
      bm("https://w3.example.com/d", "General"),
      bm("https://w3.example.com/self", "Other", "self"),
    ];
    const s = suggestCategory("https://w3.example.com/self", "x", { ...base, bookmarks, excludeId: "self" });
    expect(s).toEqual({ category: "Intranet", reason: "Other bookmarks from w3.example.com are in Intranet" });
  });

  it("matches category names in the site or title only when keywords are enabled", () => {
    const bookmarks = [bm("https://w3.ibm.com", "IBM")];
    const url = "https://ibm-support.saviyntcloud.com/x";
    expect(suggestCategory(url, "Access Hub", { ...base, bookmarks })).toBeNull();
    expect(suggestCategory(url, "Access Hub", { ...base, bookmarks, useKeywords: true })?.category).toBe("IBM");
    expect(
      suggestCategory("https://thanks.recognition-now.io", "Thanks@IBM", { ...base, bookmarks, useKeywords: true })?.category
    ).toBe("IBM");
  });

  it("matches built-in category names too (e.g. HashiCorp)", () => {
    const s = suggestCategory("https://license.hashicorp.services", "LicenseUi", { ...base, useKeywords: true });
    expect(s?.category).toBe("HashiCorp");
  });

  it("requires whole-word matches", () => {
    const bookmarks = [bm("https://box.com", "Box")];
    expect(suggestCategory("https://dropbox.com", "Dropbox", { ...base, bookmarks, useKeywords: true })).toBeNull();
  });

  it("returns null when nothing beats General", () => {
    expect(suggestCategory("https://vercel.com", "Vercel", { ...base, useKeywords: true })).toBeNull();
  });
});
