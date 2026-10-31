import { readJSON, writeJSON } from "./fs-store";
import { withLock } from "./lock";
import { linkStatusFile } from "./paths";
import type { LinkStatus } from "./link-check";
import type { Bookmark } from "./types";

export type LinkStatusMap = Record<string, LinkStatus>;

export async function readLinkStatus(): Promise<LinkStatusMap> {
  return (await readJSON<LinkStatusMap>(linkStatusFile())) ?? {};
}

/** Drops results for deleted bookmarks or URLs that have since been edited. */
export function currentStatuses(map: LinkStatusMap, bookmarks: Bookmark[]): LinkStatusMap {
  const out: LinkStatusMap = {};
  for (const b of bookmarks) {
    const s = map[b.id];
    if (s && s.url === b.url) out[b.id] = s;
  }
  return out;
}

export function saveLinkStatuses(results: LinkStatusMap, bookmarks: Bookmark[]): Promise<LinkStatusMap> {
  return withLock("link-status", async () => {
    const merged = currentStatuses({ ...(await readLinkStatus()), ...results }, bookmarks);
    await writeJSON(linkStatusFile(), merged);
    return merged;
  });
}
