import type { Bookmark } from "./types";
import type { LinkState } from "./link-check";
import { usesOf } from "./usage";

/**
 * Search syntax (case-insensitive, combine freely):
 *   free text        fuzzy match on title, site, category, tags, description, URL
 *   cat:ibm          category contains "ibm"      (alias: category:)
 *   tag:docs         a tag contains "docs"
 *   site:github.com  site contains "github.com"   (aliases: host:, domain:)
 *   is:pinned        pinned bookmarks             (also: is:unpinned)
 *   is:broken        last link check found a dead link (also: is:unreachable, is:restricted)
 *   is:unused        never opened (from Linkdeck or, with the extension, in Chrome)
 *   cat:"okta / sso" quotes allow spaces
 * The same filter repeated means OR (cat:ibm cat:github); different filters mean AND.
 */

type ParsedQuery = {
  text: string[];
  cat: string[];
  tag: string[];
  site: string[];
  is: string[];
};

const KEY_ALIASES: Record<string, keyof Omit<ParsedQuery, "text">> = {
  cat: "cat", category: "cat",
  tag: "tag", tags: "tag",
  site: "site", host: "site", domain: "site",
  is: "is",
};

export const SEARCH_HELP = "cat:  tag:  site:  is:pinned  is:broken  is:unused";

export function parseQuery(query: string): ParsedQuery {
  const parsed: ParsedQuery = { text: [], cat: [], tag: [], site: [], is: [] };
  const re = /(\w+):"([^"]*)"?|(\w+):(\S+)|"([^"]*)"?|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    const key = (m[1] ?? m[3])?.toLowerCase();
    const value = (m[2] ?? m[4] ?? "").trim().toLowerCase();
    if (key && KEY_ALIASES[key]) {
      if (value) parsed[KEY_ALIASES[key]].push(value);
      continue;
    }
    const text = (m[5] ?? m[0]).trim().toLowerCase();
    // A filter key still being typed ("cat:") shouldn't hide everything.
    const bareKey = /^(\w+):$/.exec(text);
    if (bareKey && KEY_ALIASES[bareKey[1]]) continue;
    if (text) parsed.text.push(text);
  }
  return parsed;
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** True when `needle`'s characters appear in order in `hay` (e.g. "gthb" in "github"). */
function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) if (ch === needle[i] && ++i === needle.length) return true;
  return false;
}

/** Optimal-string-alignment distance, capped at 2 for speed. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** 0..1 — how well `token` matches `field`. */
function fieldScore(token: string, field: string, { fuzzy }: { fuzzy: boolean }): number {
  if (!field) return 0;
  const lower = field.toLowerCase();
  const ws = words(lower);
  if (ws.includes(token)) return 1;
  if (ws.some((w) => w.startsWith(token))) return 0.8;
  if (lower.includes(token)) return 0.6;
  if (!fuzzy || token.length < 3) return 0;
  if (token.length >= 4 && ws.some((w) => editDistance(token, w) <= 1)) return 0.5;
  if (ws.some((w) => isSubsequence(token, w)) || isSubsequence(token, lower.replace(/[^a-z0-9]/g, ""))) return 0.3;
  return 0;
}

function textScore(b: Bookmark, token: string): number {
  const host = hostOf(b.url);
  return Math.max(
    3 * fieldScore(token, b.title, { fuzzy: true }),
    2 * fieldScore(token, host, { fuzzy: true }),
    1.5 * fieldScore(token, b.category, { fuzzy: false }),
    1.5 * Math.max(0, ...b.tags.map((t) => fieldScore(token, t, { fuzzy: false }))),
    1 * fieldScore(token, b.description, { fuzzy: false }),
    0.5 * fieldScore(token, b.url, { fuzzy: false })
  );
}

function matchesFilters(b: Bookmark, q: ParsedQuery, linkState: (id: string) => LinkState | undefined): boolean {
  const anyOf = (values: string[], test: (v: string) => boolean) => values.length === 0 || values.some(test);
  const host = hostOf(b.url);
  return (
    anyOf(q.cat, (v) => b.category.toLowerCase().includes(v)) &&
    anyOf(q.tag, (v) => b.tags.some((t) => t.toLowerCase().includes(v))) &&
    anyOf(q.site, (v) => host.includes(v.replace(/^www\./, ""))) &&
    anyOf(q.is, (v) => {
      switch (v) {
        case "pinned": return b.pinned;
        case "unpinned": return !b.pinned;
        case "broken": case "dead": return linkState(b.id) === "broken";
        case "unreachable": return linkState(b.id) === "unreachable";
        case "restricted": return linkState(b.id) === "restricted";
        case "unused": return usesOf(b) === 0;
        default: return false;
      }
    })
  );
}

/**
 * Filters and ranks bookmarks. With free text, results are ordered by match
 * quality (ties broken by usage, then input order); with filters only, the
 * input order is kept.
 */
export function searchBookmarks(
  bookmarks: Bookmark[],
  query: string,
  { linkState = () => undefined }: { linkState?: (id: string) => LinkState | undefined } = {}
): Bookmark[] {
  const q = parseQuery(query);
  const filtered = bookmarks.filter((b) => matchesFilters(b, q, linkState));
  if (q.text.length === 0) return filtered;

  const scored: { b: Bookmark; score: number; index: number }[] = [];
  filtered.forEach((b, index) => {
    let score = 0;
    for (const token of q.text) {
      const s = textScore(b, token);
      if (s === 0) return;
      score += s;
    }
    scored.push({ b, score, index });
  });
  return scored
    .sort((x, y) => y.score - x.score || usesOf(y.b) - usesOf(x.b) || x.index - y.index)
    .map((x) => x.b);
}
