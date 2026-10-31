/**
 * Linkdeck — Service Worker (background.js)
 *
 * - Right-click menu: "Save page / link to Linkdeck"
 * - Toolbar badge: ★ while viewing a page that is already bookmarked;
 *   briefly ✓ saved, = already saved, ! error after a save attempt
 *
 * - Usage sync: counts Chrome-history visits to bookmarked pages (last 90 days)
 *   for Linkdeck's "Most used" and "Recent" views — at startup, every 15
 *   minutes, and when a new tab opens.
 *
 * Tab URLs and visit counts are only ever sent to your local Linkdeck (http://localhost:<port>).
 */

importScripts("usage.js");

const DEFAULT_PORT = 3000;
const MENU_PAGE = "linkdeck-save-page";
const MENU_LINK = "linkdeck-save-link";
const WEB_PATTERNS = ["http://*/*", "https://*/*"];
const DEFAULT_TITLE = "Save to Linkdeck";
const SYNC_ALARM = "linkdeck-usage-sync";
const SYNC_EVERY_MINUTES = 15;
const MIN_SYNC_GAP_MS = 2 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
  refreshActiveTabs();
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_EVERY_MINUTES });
  syncUsage("install", { force: true });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_PAGE,
      title: "Save page to Linkdeck",
      contexts: ["page"],
      documentUrlPatterns: WEB_PATTERNS,
    });
    chrome.contextMenus.create({
      id: MENU_LINK,
      title: "Save link to Linkdeck",
      contexts: ["link"],
      targetUrlPatterns: WEB_PATTERNS,
    });
  });
});

chrome.runtime.onStartup.addListener(() => {
  refreshActiveTabs();
  chrome.alarms.get(SYNC_ALARM).then((a) => { if (!a) chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_EVERY_MINUTES }); });
  syncUsage("startup", { force: true });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) syncUsage("timer", { force: true });
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then((tab) => updateTabStatus(tab.id, tab.url)).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") updateTabStatus(tabId, tab.url);
});

// The popup reports successful saves so the badge can confirm and switch to ★.
// The new tab page asks for a usage sync and is told whether anything changed.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "linkdeck:sync-usage") {
    syncUsage("new tab").then(sendResponse);
    return true;
  }
  if (message?.type !== "linkdeck:saved") return;
  chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => {
    if (tab) flash(tab.id, "✓", "#16a34a", `Saved "${message.title}"`);
  });
});

let syncing = null;

/**
 * Sends Chrome-history visit counts for every bookmarked page to Linkdeck.
 * Returns { changed } (number of bookmarks whose counts changed), { skipped }, or { error }.
 */
function syncUsage(reason, { force = false } = {}) {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const { lastUsageSync = 0 } = await chrome.storage.local.get("lastUsageSync");
      if (!force && Date.now() - lastUsageSync < MIN_SYNC_GAP_MS) return { skipped: true };
      const base = await getBaseUrl();
      const res = await fetch(`${base}/api/bookmarks`);
      if (!res.ok) return { error: `Linkdeck answered ${res.status}` };
      const bookmarks = await res.json();
      const items = await self.LinkdeckUsage.collectUsage(bookmarks.map((b) => ({ id: b.id, url: b.url })), chrome.history);
      const post = await fetch(`${base}/api/usage/chrome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!post.ok) return { error: `Linkdeck answered ${post.status}` };
      const { changed } = await post.json();
      await chrome.storage.local.set({ lastUsageSync: Date.now() });
      return { changed, reason };
    } catch {
      return { error: "Linkdeck not reachable" };
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

async function refreshActiveTabs() {
  const tabs = await chrome.tabs.query({ active: true });
  for (const tab of tabs) updateTabStatus(tab.id, tab.url);
}

// Latest URL checked per tab, so a slow response for an old URL can't win.
const latestCheck = new Map();

/** Shows ★ on the toolbar icon when the tab's URL is already bookmarked. Returns the match or null. */
async function updateTabStatus(tabId, url) {
  if (tabId === undefined) return null;
  latestCheck.set(tabId, url);
  let match = null;
  if (url && /^https?:\/\//i.test(url)) {
    try {
      const res = await fetch(`${await getBaseUrl()}/api/bookmarks?url=${encodeURIComponent(url)}`);
      if (res.ok) match = (await res.json())[0] ?? null;
    } catch {
      // Linkdeck not running — show nothing.
    }
  }
  if (latestCheck.get(tabId) !== url) return match;
  try {
    if (match) {
      await chrome.action.setBadgeText({ tabId, text: "★" });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: "#f59e0b" });
      await chrome.action.setTitle({ tabId, title: `In Linkdeck: "${match.title}" (${match.category})` });
    } else {
      await chrome.action.setBadgeText({ tabId, text: "" });
      await chrome.action.setTitle({ tabId, title: DEFAULT_TITLE });
    }
  } catch {
    // Tab closed meanwhile.
  }
  return match;
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleMenuClick(info, tab);
});

async function getBaseUrl() {
  const { port } = await chrome.storage.local.get(["port"]);
  return `http://localhost:${parseInt(port, 10) || DEFAULT_PORT}`;
}

/** Builds the POST body for a context-menu click. Exposed for testing. */
function buildSaveRequest(info, tab) {
  if (info.menuItemId === MENU_LINK && info.linkUrl) {
    // No reliable link text in the context-menu API; Linkdeck fetches the page title.
    return { url: info.linkUrl, ...(info.selectionText ? { title: info.selectionText.trim().slice(0, 300) } : {}) };
  }
  const url = info.pageUrl || tab?.url;
  const body = { url };
  if (tab?.title) body.title = tab.title;
  if (tab?.favIconUrl && /^https?:\/\//i.test(tab.favIconUrl)) body.faviconUrl = tab.favIconUrl;
  return body;
}

function flash(tabId, text, color, title) {
  const target = tabId !== undefined ? { tabId } : {};
  chrome.action.setBadgeText({ ...target, text });
  chrome.action.setBadgeBackgroundColor({ ...target, color });
  chrome.action.setTitle({ ...target, title });
  setTimeout(() => {
    if (tabId === undefined) {
      chrome.action.setBadgeText({ text: "" });
      chrome.action.setTitle({ title: DEFAULT_TITLE });
      return;
    }
    chrome.tabs.get(tabId).then((tab) => updateTabStatus(tab.id, tab.url)).catch(() => {});
  }, 4000);
}

/** Saves the page or link and reports the outcome on the toolbar badge. Returns the outcome. */
async function handleMenuClick(info, tab) {
  const tabId = tab?.id;
  const body = buildSaveRequest(info, tab);
  try {
    const res = await fetch(`${await getBaseUrl()}/api/bookmarks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 201) {
      const saved = await res.json();
      flash(tabId, "✓", "#16a34a", `Saved "${saved.title}" to ${saved.category}`);
      return "saved";
    }
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      flash(tabId, "=", "#2563eb", `Already saved${data.bookmark?.title ? `: "${data.bookmark.title}"` : ""}`);
      return "duplicate";
    }
    const data = await res.json().catch(() => ({}));
    flash(tabId, "!", "#dc2626", `Could not save: ${data.error || `HTTP ${res.status}`}`);
    return "error";
  } catch {
    flash(tabId, "!", "#dc2626", "Could not reach the Linkdeck. Is it running?");
    return "error";
  }
}
