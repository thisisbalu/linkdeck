/**
 * scripts/repair-favicons.ts
 *
 * Re-fetches favicons for bookmarks whose icon is missing or broken
 * (or for every bookmark with --all), using the same code path as the app:
 * lib/favicon for fetching/converting and lib/bookmarks for saving, so updates
 * are locked, atomic and backed up, and LINKDECK_DATA_DIR is respected.
 * Safe to run while Linkdeck is running.
 *
 *   npm run favicons:repair
 *   npm run favicons:repair -- --all
 */

import fs from "fs";
import path from "path";
import { readBookmarks, updateBookmark, BookmarkNotFoundError } from "../lib/bookmarks";
import { fetchAndSaveFavicon, findFavicon } from "../lib/favicon";
import { faviconsDir } from "../lib/paths";
import type { Bookmark } from "../lib/types";

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ""; }
}

function isBroken(b: Bookmark): boolean {
  if (!b.favicon) return true;
  return !findFavicon(path.basename(b.favicon));
}

async function main() {
  const forceAll = process.argv.includes("--all");
  const bookmarks = await readBookmarks();
  const targets = bookmarks.filter((b) => hostOf(b.url) && (forceAll || isBroken(b)));

  if (targets.length === 0) {
    console.log("✅ No bookmarks need favicon repair.");
    return;
  }

  const byHost = new Map<string, Bookmark[]>();
  for (const b of targets) {
    const host = hostOf(b.url);
    byHost.set(host, [...(byHost.get(host) ?? []), b]);
  }
  console.log(`Repairing favicons for ${targets.length} bookmark(s) across ${byHost.size} site(s)…\n`);

  let updated = 0;
  let missing = 0;
  for (const [host, group] of byHost) {
    if (forceAll) {
      try { fs.unlinkSync(path.join(faviconsDir(), `${host}.png`)); } catch { /* not cached */ }
    }
    const favicon = await fetchAndSaveFavicon(group[0].url).catch(() => "");
    console.log(`  ${favicon ? "✅" : "❌"} ${host}`);
    if (!favicon) missing++;

    for (const b of group) {
      if (b.favicon === favicon) continue;
      try {
        await updateBookmark(b.id, { favicon });
        updated++;
      } catch (err) {
        if (!(err instanceof BookmarkNotFoundError)) throw err;
      }
    }
  }

  console.log(`\nDone. Updated ${updated} bookmark(s); ${missing} site(s) have no icon (a letter is shown instead).`);
  console.log("If Linkdeck runs as a service, new icons appear without a restart.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
