/**
 * Tests for lib/search.ts
 */

import { describe, it, expect } from "vitest";
import { parseQuery, searchBookmarks } from "@/lib/search";
import type { Bookmark } from "@/lib/types";

let n = 0;
function bm(o: Partial<Bookmark>): Bookmark {
  n++;
  return {
    id: `id${n}`, url: `https://site${n}.com`, title: `Item ${n}`, description: "", category: "General",
    tags: [], favicon: "", addedAt: "2026-01-01T00:00:00Z", pinned: false, ...o,
  };
}

const gh = bm({ id: "gh", url: "https://github.com/hashicorp/nomad", title: "Nomad repo", category: "GitHub", tags: ["code"] });
const jira = bm({ id: "jira", url: "https://hashicorp.atlassian.net/browse/X", title: "Sprint board", category: "Jira", tags: ["tickets"], pinned: true });
const okta = bm({ id: "okta", url: "https://hashicorp.okta.com", title: "Okta dashboard", category: "Okta / SSO", visitCount: 5 });
const w3 = bm({ id: "w3", url: "https://w3.ibm.com/hr", title: "HR Zone", category: "IBM", description: "payroll and benefits" });
const all = [gh, jira, okta, w3];
const ids = (list: Bookmark[]) => list.map((b) => b.id);

describe("parseQuery", () => {
  it("separates filters, aliases and quoted values from free text", () => {
    expect(parseQuery('Nomad cat:GitHub site:github.com tag:"code review" is:pinned category:ibm host:w3 "hr zone"')).toEqual({
      text: ["nomad", "hr zone"],
      cat: ["github", "ibm"],
      tag: ["code review"],
      site: ["github.com", "w3"],
      is: ["pinned"],
    });
  });

  it("treats unknown keys (like URLs) as text and ignores empty filters", () => {
    expect(parseQuery("https://x.com foo: cat:")).toEqual({ text: ["https://x.com", "foo:"], cat: [], tag: [], site: [], is: [] });
  });
});

describe("searchBookmarks filters", () => {
  it("filters by category, tag, site and is:", () => {
    expect(ids(searchBookmarks(all, "cat:okta"))).toEqual(["okta"]);
    expect(ids(searchBookmarks(all, 'cat:"okta / sso"'))).toEqual(["okta"]);
    expect(ids(searchBookmarks(all, "tag:tick"))).toEqual(["jira"]);
    expect(ids(searchBookmarks(all, "site:hashicorp"))).toEqual(["jira", "okta"]);
    expect(ids(searchBookmarks(all, "site:www.github.com"))).toEqual(["gh"]);
    expect(ids(searchBookmarks(all, "is:pinned"))).toEqual(["jira"]);
    expect(ids(searchBookmarks(all, "is:unused"))).toEqual(["gh", "jira", "w3"]);
  });

  it("ORs repeated filters and ANDs different ones", () => {
    expect(ids(searchBookmarks(all, "cat:github cat:jira"))).toEqual(["gh", "jira"]);
    expect(ids(searchBookmarks(all, "cat:github cat:jira is:pinned"))).toEqual(["jira"]);
  });

  it("supports link-check states", () => {
    const linkState = (id: string) => (id === "w3" ? "broken" : id === "gh" ? "unreachable" : undefined);
    expect(ids(searchBookmarks(all, "is:broken", { linkState }))).toEqual(["w3"]);
    expect(ids(searchBookmarks(all, "is:unreachable", { linkState }))).toEqual(["gh"]);
  });

  it("keeps input order when there is no free text", () => {
    expect(ids(searchBookmarks([w3, gh], "is:unpinned"))).toEqual(["w3", "gh"]);
  });
});

describe("searchBookmarks text", () => {
  it("ranks title matches above description/url matches", () => {
    const a = bm({ id: "a", title: "Payroll portal" });
    expect(ids(searchBookmarks([w3, a], "payroll"))).toEqual(["a", "w3"]);
  });

  it("requires every word to match", () => {
    expect(ids(searchBookmarks(all, "sprint board"))).toEqual(["jira"]);
    expect(ids(searchBookmarks(all, "sprint nomad"))).toEqual([]);
  });

  it("tolerates typos and abbreviations", () => {
    expect(ids(searchBookmarks(all, "nomda"))).toEqual(["gh"]);   // transposition
    expect(ids(searchBookmarks(all, "gthb"))).toEqual(["gh"]);    // subsequence of github
    expect(ids(searchBookmarks(all, "dashbord"))).toEqual(["okta"]); // missing letter
  });

  it("combines text with filters and breaks ties by usage", () => {
    const o2 = bm({ id: "o2", url: "https://okta.example.com", title: "Okta admin", visitCount: 9 });
    expect(ids(searchBookmarks([okta, o2], "okta"))).toEqual(["o2", "okta"]);
    expect(ids(searchBookmarks([okta, o2], "okta site:hashicorp"))).toEqual(["okta"]);
  });

  it("does not fuzzy-match very short words", () => {
    expect(ids(searchBookmarks(all, "zq"))).toEqual([]);
  });
});
