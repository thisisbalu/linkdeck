/**
 * Linkdeck — Chrome-history usage matching (used by background.js).
 *
 * For each bookmark, counts visits in Chrome history over the last N days to
 * that exact page, ignoring a trailing "/" and in-page anchors ("#section").
 * Hash routes used by single-page apps ("#/apps/all", "#!/x") are kept, since
 * they are different pages. Reloads and embedded frames don't count. Only
 * bookmarked URLs are ever looked up.
 *
 * Written as a plain script (importScripts in the service worker) that also
 * exports via module.exports so it can be unit-tested in Node.
 */
(function (root) {
  const IGNORED_TRANSITIONS = new Set(["reload", "auto_subframe", "manual_subframe"]);

  /**
   * Canonical form for matching: lowercase host, no default port, no trailing
   * slash, no plain anchor — but SPA hash routes ("#/…", "#!/…") are kept.
   */
  function normalizeForUsage(raw) {
    try {
      const u = new URL(String(raw).trim());
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      const pathname = u.pathname.replace(/\/+$/, "");
      const route = /^#!?\//.test(u.hash) ? u.hash.replace(/\/+$/, "") : "";
      const hash = route === "#" || route === "#!" ? "" : route;
      return `${u.protocol}//${u.host}${pathname}${u.search}${hash}`;
    } catch {
      return null;
    }
  }

  /** Visits within the window that count as real opens. */
  function countVisits(visits, sinceMs) {
    let count = 0;
    let last = 0;
    for (const v of visits || []) {
      if (!v || typeof v.visitTime !== "number" || v.visitTime < sinceMs) continue;
      if (IGNORED_TRANSITIONS.has(v.transition)) continue;
      count++;
      if (v.visitTime > last) last = v.visitTime;
    }
    return { count, last };
  }

  /**
   * @param bookmarks  [{ id, url }]
   * @param api        { search({ text, startTime, maxResults }), getVisits({ url }) } — chrome.history or a fake
   * @returns          [{ id, visits, lastVisitAt }] for every bookmark with a valid URL
   */
  async function collectUsage(bookmarks, api, { days = 90, now = Date.now() } = {}) {
    const since = now - days * 24 * 60 * 60 * 1000;
    const byKey = new Map(); // normalized URL → bookmark ids
    const hosts = new Set();
    for (const b of bookmarks) {
      const key = normalizeForUsage(b.url);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(b.id);
      hosts.add(new URL(b.url).hostname);
    }

    const totals = new Map(); // key → { count, last }
    for (const host of hosts) {
      const items = await api.search({ text: host, startTime: since, maxResults: 10000 });
      for (const item of items || []) {
        const key = normalizeForUsage(item.url);
        if (!key || !byKey.has(key)) continue;
        const { count, last } = countVisits(await api.getVisits({ url: item.url }), since);
        const prev = totals.get(key) || { count: 0, last: 0 };
        totals.set(key, { count: prev.count + count, last: Math.max(prev.last, last) });
      }
    }

    const out = [];
    for (const [key, ids] of byKey) {
      const t = totals.get(key) || { count: 0, last: 0 };
      for (const id of ids) {
        out.push({ id, visits: t.count, lastVisitAt: t.count > 0 ? new Date(t.last).toISOString() : null });
      }
    }
    return out;
  }

  const api = { normalizeForUsage, countVisits, collectUsage };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LinkdeckUsage = api;
})(typeof self !== "undefined" ? self : globalThis);
