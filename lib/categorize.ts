import { BUILTIN_CATEGORIES } from "./enrich-bookmark";
import { lookupRule, ruleHost, type CategoryRules } from "./category-rules";
import type { Bookmark } from "./types";

export const GENERAL = "General";

type Suggestion = { category: string; reason: string };

type SuggestContext = {
  rules: CategoryRules;
  /** All bookmarks, used to learn which category each site is usually filed under. */
  bookmarks: Bookmark[];
  /** Category produced by the built-in URL/title rules (enrichBookmark). */
  builtInCategory: string;
  /** Also match category names against words in the site and title. */
  useKeywords?: boolean;
  /** Bookmark being categorized, so it doesn't count towards its own site. */
  excludeId?: string;
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokens(url: string, title: string): Set<string> {
  const host = ruleHost(url);
  return new Set(
    [...host.split(/[.-]/), ...title.toLowerCase().split(/[^a-z0-9]+/)].filter(Boolean)
  );
}

/**
 * Picks a category for a bookmark, in priority order:
 *   1. your rule for the site
 *   2. the built-in rules (if they found something better than General)
 *   3. the category most other bookmarks from the same site use
 *   4. (optional) a category whose name appears in the site or title
 * Returns null when nothing beats "General".
 */
export function suggestCategory(url: string, title: string, ctx: SuggestContext): Suggestion | null {
  const host = ruleHost(url);

  const rule = lookupRule(ctx.rules, url);
  if (rule) return { category: rule, reason: `Your rule for ${host}` };

  if (ctx.builtInCategory && ctx.builtInCategory !== GENERAL) {
    return { category: ctx.builtInCategory, reason: "Matches a built-in rule" };
  }

  const counts = new Map<string, number>();
  for (const b of ctx.bookmarks) {
    if (b.id === ctx.excludeId || b.category === GENERAL || ruleHost(b.url) !== host) continue;
    counts.set(b.category, (counts.get(b.category) ?? 0) + 1);
  }
  const bySite = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (bySite) {
    return { category: bySite[0], reason: `Other bookmarks from ${host} are in ${bySite[0]}` };
  }

  if (ctx.useKeywords) {
    // Prefer your own categories (most used first), then built-in names.
    const usage = new Map<string, number>();
    for (const b of ctx.bookmarks) {
      if (b.category !== GENERAL) usage.set(b.category, (usage.get(b.category) ?? 0) + 1);
    }
    const candidates = [
      ...Array.from(usage.keys()).sort((a, b) => usage.get(b)! - usage.get(a)! || a.localeCompare(b)),
      ...BUILTIN_CATEGORIES.filter((c) => !usage.has(c)),
    ];
    const words = tokens(url, title);
    for (const category of candidates) {
      const key = normalize(category);
      if (key.length >= 3 && words.has(key)) {
        return { category, reason: `Site or title mentions "${category}"` };
      }
    }
  }

  return null;
}
