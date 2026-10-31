import { manualCompare } from "./sort";
import type { Bookmark } from "./types";
import type { CategoryRules } from "./category-rules";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const unixSeconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000) || 0;

/**
 * Netscape bookmark file — importable by Chrome, Edge, Firefox and Safari.
 * One folder per category inside a "Linkdeck" folder; pinned first.
 */
export function toNetscapeHtml(bookmarks: Bookmark[], now = new Date()): string {
  const byCategory = new Map<string, Bookmark[]>();
  for (const b of bookmarks) byCategory.set(b.category, [...(byCategory.get(b.category) ?? []), b]);
  const categories = Array.from(byCategory.keys()).sort((a, b) => a.localeCompare(b));
  const stamp = Math.floor(now.getTime() / 1000);

  const lines = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<!-- This is an automatically generated file. It will be read and overwritten. DO NOT EDIT! -->",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Bookmarks</TITLE>",
    "<H1>Bookmarks</H1>",
    "<DL><p>",
    `    <DT><H3 ADD_DATE="${stamp}" LAST_MODIFIED="${stamp}">Linkdeck</H3>`,
    "    <DL><p>",
  ];
  for (const category of categories) {
    const items = byCategory.get(category)!.sort((a, b) => Number(b.pinned) - Number(a.pinned) || manualCompare(a, b));
    lines.push(`        <DT><H3 ADD_DATE="${stamp}">${escapeHtml(category)}</H3>`, "        <DL><p>");
    for (const b of items) {
      const tags = b.tags.length ? ` TAGS="${escapeHtml(b.tags.join(","))}"` : "";
      lines.push(`            <DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="${unixSeconds(b.addedAt)}"${tags}>${escapeHtml(b.title)}</A>`);
      if (b.description) lines.push(`            <DD>${escapeHtml(b.description)}`);
    }
    lines.push("        </DL><p>");
  }
  lines.push("    </DL><p>", "</DL><p>", "");
  return lines.join("\n");
}

/** Full-fidelity export: every field plus your site rules. */
export function toJsonExport(bookmarks: Bookmark[], categoryRules: CategoryRules, now = new Date()) {
  return {
    app: "linkdeck",
    version: 1,
    exportedAt: now.toISOString(),
    bookmarks,
    categoryRules,
  };
}
