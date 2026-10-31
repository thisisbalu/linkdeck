/**
 * Returns true if `raw` parses as an absolute http(s) URL.
 */
export function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Canonical form of a URL used for duplicate detection.
 * Lowercases scheme/host (via URL parsing), drops default ports, an empty
 * fragment, and trailing slashes on the path. Path, query and non-empty
 * fragments are preserved because they are often meaningful (SPA routes).
 */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const u = new URL(trimmed);
    let pathname = u.pathname.replace(/\/+$/, "");
    if (pathname === "/") pathname = "";
    const hash = u.hash === "#" ? "" : u.hash;
    return `${u.protocol}//${u.host}${pathname}${u.search}${hash}`;
  } catch {
    return trimmed;
  }
}

export function hostnameOf(raw: string): string {
  try {
    return new URL(raw).hostname;
  } catch {
    return "";
  }
}
