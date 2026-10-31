import fs from "fs";
import path from "path";
import sharp from "sharp";

import { assertStorageAvailable, faviconsDir } from "./paths";

/** Favicons are cached in <data folder>/favicons so they travel with your data. */
export function findFavicon(fileName: string): string | null {
  const file = path.join(faviconsDir(), fileName);
  return fs.existsSync(file) ? file : null;
}

/** Favicon file names are `<hostname>.png`; anything else is rejected. */
export function isFaviconFileName(name: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.png$/i.test(name) && name.length <= 260;
}

// Minimum real icon size — Google's 1×1 transparent placeholder is ~68 bytes
const MIN_ICON_BYTES = 200;

// Valid image content-type prefixes
const IMAGE_CONTENT_TYPES = ["image/", "application/octet-stream"];

/**
 * Fetch a URL and return the buffer only if:
 *   - HTTP response is OK
 *   - Content-Type looks like an image (not HTML/JSON/text)
 *   - Buffer is larger than the placeholder threshold
 * Returns null on any failure.
 */
async function tryFetch(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Linkdeck/1.0)" },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    // Reject HTML / text responses (login redirects, error pages)
    const contentType = res.headers.get("content-type") ?? "";
    const isImage = IMAGE_CONTENT_TYPES.some((t) => contentType.startsWith(t));
    // Also allow no content-type (many /favicon.ico endpoints omit it)
    if (contentType && !isImage) return null;

    const buf = Buffer.from(await res.arrayBuffer());

    // Reject tiny placeholders and HTML files masquerading as images
    if (buf.length < MIN_ICON_BYTES) return null;

    // Reject if buffer starts with HTML doctype / tags
    const start = buf.slice(0, 15).toString("ascii").toLowerCase();
    if (start.startsWith("<!doctype") || start.startsWith("<html")) return null;

    return buf;
  } catch {
    return null;
  }
}

/**
 * Convert an arbitrary image buffer (PNG, ICO, WebP, GIF, JPEG…) to a
 * 64×64 PNG buffer using sharp. Returns null if conversion fails.
 */
async function toPng(buf: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buf)
      .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    // sharp can't handle this format — return raw buffer as-is
    // (browser will try to render it; worst case the img onError fires)
    return buf;
  }
}

/**
 * Fetches and saves a favicon for the given URL's domain.
 *
 * Source priority (first real image wins):
 *  1. prefillFaviconUrl  — icon from the browser tab (highest quality)
 *  2. Google Favicon API — https://www.google.com/s2/favicons?domain=…&sz=64
 *  3. DuckDuckGo icons   — https://icons.duckduckgo.com/ip3/<domain>.ico
 *  4. Domain root        — https://<domain>/favicon.ico
 *
 * All formats (ICO, WebP, GIF, …) are converted to 64×64 PNG via sharp.
 * Already-cached valid files are returned immediately without re-fetching.
 * Returns "" if all sources fail — UI shows the letter fallback.
 */
export async function fetchAndSaveFavicon(
  url: string,
  prefillFaviconUrl?: string
): Promise<string> {
  let domain: string;
  try {
    domain = new URL(url).hostname;
  } catch {
    return "";
  }

  assertStorageAvailable();
  const fileName = `${domain}.png`;
  const dir = faviconsDir();
  const filePath = path.join(dir, fileName);
  const publicPath = `/favicons/${fileName}`;

  // Return cached file — but only if it's actually an image (not HTML junk)
  if (fs.existsSync(filePath)) {
    const cached = fs.readFileSync(filePath);
    const start = cached.slice(0, 15).toString("ascii").toLowerCase();
    const isHtml = start.startsWith("<!doctype") || start.startsWith("<html");
    const isTooSmall = cached.length < MIN_ICON_BYTES;
    if (!isHtml && !isTooSmall) {
      return publicPath; // valid cache hit
    }
    // Bad cache — delete and re-fetch
    fs.unlinkSync(filePath);
  }

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Build ordered source list
  // For Google API: also try the root domain (e.g. atlassian.net for foo.atlassian.net)
  // because subdomains often 404 while the root domain has a good icon.
  const rootDomain = domain.split(".").slice(-2).join(".");
  const sources: string[] = [];
  if (prefillFaviconUrl?.trim()) sources.push(prefillFaviconUrl.trim());
  sources.push(
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
    ...(rootDomain !== domain ? [`https://www.google.com/s2/favicons?domain=${rootDomain}&sz=64`] : []),
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://${domain}/favicon.ico`,
  );

  for (const source of sources) {
    const raw = await tryFetch(source);
    if (!raw) continue;

    // Convert to PNG (handles ICO, WebP, GIF, JPEG, etc.)
    const png = await toPng(raw);
    if (!png) continue;

    fs.writeFileSync(filePath, png);
    return publicPath;
  }

  return "";
}
