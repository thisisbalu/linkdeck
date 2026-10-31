/**
 * scripts/data-move.ts — command-line version of ⋯ → Storage location…
 *
 *   npm run data:where
 *   npm run data:move -- "~/Library/CloudStorage/Box-Box/Linkdeck"
 *   npm run data:move -- "<folder>" --use-existing   # start using data already there
 *   npm run data:move -- "<folder>" --replace        # overwrite data there (kept as backups)
 *   npm run data:move -- --default                   # back to the project's data/ folder
 *
 * Safe while Linkdeck is running: the running app switches immediately.
 */

import { defaultDataDir } from "../lib/paths";
import { moveData, storageStatus, StorageMoveError, type MoveMode } from "../lib/storage";

function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--where" || args.length === 0) {
    const s = storageStatus();
    console.log(`${s.label}${s.isDefault ? " (default)" : ""}: ${s.dataDir}`);
    console.log(s.available ? `  ${s.summary.bookmarks ?? 0} bookmarks, ${formatBytes(s.summary.bytes)}` : `  ⚠ ${s.error}`);
    if (s.source === "env") console.log("  (set by LINKDECK_DATA_DIR)");
    for (const c of s.conflicts) console.log(`  ⚠ conflict copy: ${c.file} — resolve it in the app`);
    if (s.suggestions.length) {
      console.log("\nSuggested cloud folders:");
      for (const g of s.suggestions) console.log(`  ${g.label}: ${g.path}${g.hasData ? "  (has Linkdeck data)" : ""}`);
    }
    return;
  }

  const target = args.includes("--default") ? defaultDataDir() : args.find((a) => !a.startsWith("--"));
  const mode: MoveMode = args.includes("--use-existing") ? "use-existing" : args.includes("--replace") ? "replace" : "auto";
  const result = await moveData(target, mode);
  if (result.needsChoice) {
    console.log(`That folder already has Linkdeck data (${result.existing.bookmarks} bookmarks); this Mac has ${result.current.bookmarks}.`);
    console.log("Re-run with --use-existing to use the data there, or --replace to overwrite it with this Mac's (theirs is kept as backups).");
    process.exit(2);
  }
  const what = result.mode === "switched" ? "Now using" : result.mode === "replaced" ? "Replaced data in" : "Moved data to";
  console.log(`✓ ${what} ${result.label}: ${result.to}`);
  if (result.copied.files) console.log(`  ${result.copied.files} files, ${formatBytes(result.copied.bytes)} copied and verified`);
  if (result.previous) console.log(`  Old project folder kept as ${result.previous}`);
}

main().catch((err) => {
  console.error(err instanceof StorageMoveError ? `✗ ${err.message}` : err);
  process.exit(1);
});
