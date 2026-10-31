/**
 * Request checks applied by middleware.ts to every request.
 *
 * - Host must be a loopback name. Blocks DNS-rebinding attacks where a
 *   malicious site points its own domain at 127.0.0.1 to read Linkdeck.
 * - Mutating /api calls must come from Linkdeck itself (same origin), the
 *   Chrome extension, or a non-browser client (no Origin header, e.g. curl).
 *   Blocks cross-site request forgery from pages you happen to visit.
 * - POST/PATCH bodies must be declared as JSON. Browsers can only send JSON
 *   cross-origin after a CORS preflight, which this server never approves.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

export type GuardInput = {
  method: string;
  pathname: string;
  host: string | null;
  origin: string | null;
  contentType: string | null;
};

type GuardResult = { ok: true } | { ok: false; status: number; error: string };

function hostnameOf(host: string): string {
  // "[::1]:3000" → "[::1]", "localhost:3000" → "localhost"
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
}

function isAllowedOrigin(origin: string, host: string): boolean {
  if (origin.startsWith("chrome-extension://")) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function checkRequest({ method, pathname, host, origin, contentType }: GuardInput): GuardResult {
  if (!host || !LOOPBACK_HOSTS.has(hostnameOf(host.toLowerCase()))) {
    return { ok: false, status: 403, error: "Host not allowed" };
  }

  const upper = method.toUpperCase();
  if (!pathname.startsWith("/api/") || SAFE_METHODS.has(upper)) return { ok: true };

  if (origin !== null && !isAllowedOrigin(origin, host.toLowerCase())) {
    return { ok: false, status: 403, error: "Cross-origin request blocked" };
  }

  if (BODY_METHODS.has(upper) && !/^application\/json\b/i.test(contentType ?? "")) {
    return { ok: false, status: 415, error: "Content-Type must be application/json" };
  }

  return { ok: true };
}
