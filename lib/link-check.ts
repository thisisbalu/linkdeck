/**
 * Dead-link checking. Pure classification + a network check with an
 * injectable fetch so it can be unit tested.
 */

export type LinkState = "ok" | "broken" | "unreachable" | "restricted";

export type LinkStatus = {
  url: string;          // the URL that was checked (stale if the bookmark's URL changed since)
  state: LinkState;
  code?: number;        // final HTTP status, if any
  detail: string;       // human-readable explanation
  checkedAt: string;    // ISO date
};

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export function classifyResponse(code: number): Pick<LinkStatus, "state" | "detail"> {
  if (code === 404 || code === 410) return { state: "broken", detail: code === 404 ? "Page not found (404)" : "Page removed (410)" };
  if (code === 401 || code === 403 || code === 407) return { state: "restricted", detail: `Needs sign-in or access (${code})` };
  if (code >= 500) return { state: "unreachable", detail: `Server error (${code})` };
  if (code === 429) return { state: "ok", detail: "Rate limited (429) — probably fine" };
  if (code >= 400) return { state: "broken", detail: `Request failed (${code})` };
  return { state: "ok", detail: `OK (${code})` };
}

export function classifyError(err: unknown): Pick<LinkStatus, "state" | "detail"> {
  const e = err as { name?: string; code?: string; cause?: { code?: string } };
  const code = e?.cause?.code ?? e?.code ?? "";
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return { state: "unreachable", detail: "Timed out" };
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { state: "unreachable", detail: "Site not found (DNS) — may need VPN" };
  if (code === "ECONNREFUSED") return { state: "unreachable", detail: "Connection refused" };
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") return { state: "unreachable", detail: "Connection dropped" };
  if (/CERT|SSL|TLS/i.test(code)) return { state: "unreachable", detail: "Certificate problem" };
  return { state: "unreachable", detail: "Could not connect" };
}

// These sites answer 404 (not 401/403) for private pages when you're signed out.
const HIDES_PRIVATE_AS_404 = /(^|\.)(github\.com|gitlab\.com|bitbucket\.org)$/i;

function hidesPrivatePages(url: string): boolean {
  try { return HIDES_PRIVATE_AS_404.test(new URL(url).hostname); } catch { return false; }
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

async function request(fetchImpl: FetchLike, url: string, method: "HEAD" | "GET", timeoutMs: number): Promise<number> {
  const res = await fetchImpl(url, {
    method,
    redirect: "follow",
    headers: { "User-Agent": BROWSER_UA, Accept: "text/html,*/*;q=0.8" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  // Never download bodies — the status code is all we need.
  await res.body?.cancel().catch(() => {});
  return res.status;
}

/**
 * Checks one URL: HEAD first (cheap), then GET if HEAD fails or is refused,
 * since many servers mishandle HEAD.
 */
export async function checkUrl(
  url: string,
  { fetchImpl = fetch as FetchLike, timeoutMs = 8000, now = () => new Date() } = {}
): Promise<LinkStatus> {
  let result: Pick<LinkStatus, "state" | "detail"> & { code?: number };
  try {
    let code = await request(fetchImpl, url, "HEAD", timeoutMs).catch(() => 0);
    if (code === 0 || code >= 400) code = await request(fetchImpl, url, "GET", timeoutMs);
    result = { ...classifyResponse(code), code };
    if (code === 404 && hidesPrivatePages(url)) {
      result = { state: "restricted", detail: "Not found, or private (this site hides private pages)", code };
    }
  } catch (err) {
    result = classifyError(err);
  }
  return { url, ...result, checkedAt: now().toISOString() };
}

/** Runs `worker` over `items` with at most `concurrency` in flight, yielding results as they finish. */
export async function* mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): AsyncGenerator<R> {
  const queue = [...items];
  const inFlight = new Map<number, Promise<{ key: number; value: R }>>();
  let key = 0;
  const launch = () => {
    const item = queue.shift()!;
    const k = key++;
    inFlight.set(k, worker(item).then((value) => ({ key: k, value })));
  };
  while (inFlight.size < concurrency && queue.length) launch();
  while (inFlight.size) {
    const { key: done, value } = await Promise.race(inFlight.values());
    inFlight.delete(done);
    if (queue.length) launch();
    yield value;
  }
}
