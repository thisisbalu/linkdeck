/**
 * Navigates the current tab to a bookmark.
 *
 * When Linkdeck is embedded as the Chrome new-tab page (an iframe inside the
 * extension page), navigating the iframe would fail for sites that forbid
 * framing, so ask the parent extension page to navigate the whole tab instead.
 */
export function openBookmarkInPlace(url: string): void {
  if (window.parent !== window) {
    window.parent.postMessage({ type: "linkdeck:navigate", url }, "*");
    return;
  }
  window.location.href = url;
}

/** Counts an open for "Most used" / "Recent". Fire-and-forget; survives page navigation. */
export function recordVisit(id: string): void {
  fetch(`/api/bookmarks/${id}/visit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    keepalive: true,
  }).catch(() => {});
}
