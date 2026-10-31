/**
 * Linkdeck — Chrome Extension Popup
 *
 * Flow:
 *  1. On open: read tab title/url/favicon via chrome.scripting
 *  2. Check if URL already bookmarked (GET /api/bookmarks?url=…)
 *  3. If new: show editable form pre-filled with real title
 *  4. On save: POST /api/bookmarks with title + faviconUrl
 *  5. Show confirmation, set toolbar badge
 */

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const states = {
  loading:  $("state-loading"),
  exists:   $("state-exists"),
  ready:    $("state-ready"),
  saved:    $("state-saved"),
  error:    $("state-error"),
};

// ── State management ──────────────────────────────────────────────────────────
function showState(name) {
  Object.entries(states).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
}

// ── Port persistence ──────────────────────────────────────────────────────────
const portInput = $("input-port");

chrome.storage.local.get(["port"], (res) => {
  portInput.value = res.port || 3000;
});

portInput.addEventListener("change", () => {
  chrome.storage.local.set({ port: parseInt(portInput.value, 10) || 3000 });
});

function getBaseUrl() {
  const port = parseInt(portInput.value, 10) || 3000;
  return `http://localhost:${port}`;
}

// ── Read data from the active tab ─────────────────────────────────────────────
async function readTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Use scripting API to read real title + favicon from the tab's DOM
  let tabData = { title: tab.title || "", url: tab.url || "", favicon: "" };

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const icons = document.querySelectorAll('link[rel~="icon"]');
        let favicon = "";
        for (const icon of icons) {
          if (icon.href && !icon.href.startsWith("data:")) {
            favicon = icon.href;
            break;
          }
        }
        return {
          title: document.title,
          url: location.href,
          favicon,
        };
      },
    });
    if (result?.result) {
      tabData = result.result;
    }
  } catch {
    // scripting may be blocked on chrome:// pages — fall back to tab metadata
    tabData.favicon = tab.favIconUrl || "";
  }

  return tabData;
}

// ── Check if URL already exists ───────────────────────────────────────────────
async function checkExists(url) {
  try {
    const res = await fetch(`${getBaseUrl()}/api/bookmarks?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const matches = await res.json();
    return matches[0] || null;
  } catch {
    return null;
  }
}

// ── Render category + tags in meta row ───────────────────────────────────────
function renderMeta(category, tags) {
  const metaRow = $("meta-row");
  metaRow.innerHTML = "";

  if (category) {
    const badge = document.createElement("span");
    badge.className = "badge-category";
    badge.textContent = category;
    metaRow.appendChild(badge);
  }

  (tags || []).slice(0, 4).forEach((tag) => {
    const t = document.createElement("span");
    t.className = "badge-tag";
    t.textContent = tag;
    metaRow.appendChild(t);
  });
}

// ── Save bookmark ─────────────────────────────────────────────────────────────
async function saveBookmark(tabData) {
  const title = $("input-title").value.trim();
  const description = $("input-description").value.trim();

  if (!title) {
    $("error-msg").textContent = "Title is required.";
    $("error-msg").hidden = false;
    return;
  }

  $("error-msg").hidden = true;
  $("btn-save").disabled = true;
  $("btn-save").textContent = "Saving…";

  try {
    const res = await fetch(`${getBaseUrl()}/api/bookmarks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: tabData.url,
        title,
        ...(description ? { description } : {}),
        ...(tabData.favicon ? { faviconUrl: tabData.favicon } : {}),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Server error ${res.status}`);
    }

    // Show saved state
    $("saved-badge").hidden = false;
    showState("saved");

    // Toolbar badge: ✓ briefly, then ★ (handled by the service worker)
    chrome.runtime.sendMessage({ type: "linkdeck:saved", title }).catch(() => {});

  } catch (err) {
    $("btn-save").disabled = false;
    $("btn-save").textContent = "Save bookmark";
    $("error-msg").textContent = err.message || "Could not reach Linkdeck. Is it running?";
    $("error-msg").hidden = false;
  }
}

// ── Main init ─────────────────────────────────────────────────────────────────
async function init() {
  showState("loading");

  let tabData;
  try {
    tabData = await readTab();
  } catch (err) {
    $("error-banner").textContent = "Could not read this tab. Try on a regular web page.";
    showState("error");
    return;
  }

  // Check for duplicate
  const existing = await checkExists(tabData.url);
  if (existing) {
    $("exists-url").textContent = existing.title || tabData.url;
    showState("exists");

    $("btn-open-linkdeck").addEventListener("click", () => {
      chrome.tabs.create({ url: getBaseUrl() });
    });
    return;
  }

  showReadyState(tabData);
}

function showReadyState(tabData) {
  // Pre-fill fields
  $("input-title").value = tabData.title || "";
  $("input-description").value = "";

  // Domain label
  try {
    $("domain-label").textContent = new URL(tabData.url).hostname.replace("www.", "");
  } catch {
    $("domain-label").textContent = tabData.url;
  }

  // Favicon
  const faviconImg = $("favicon-img");
  if (tabData.favicon) {
    faviconImg.src = tabData.favicon;
    faviconImg.hidden = false;
  } else {
    faviconImg.hidden = true;
  }

  // Show state
  showState("ready");

  // Fetch enrichment preview (category + tags) in background — non-blocking
  fetch(`${getBaseUrl()}/api/bookmarks/enrich?url=${encodeURIComponent(tabData.url)}&title=${encodeURIComponent(tabData.title)}`)
    .then((r) => r.ok ? r.json() : null)
    .then((data) => { if (data) renderMeta(data.category, data.tags); })
    .catch(() => {}); // silently ignore — enrichment preview is optional

  // Save on button click
  $("btn-save").addEventListener("click", () => saveBookmark(tabData));

  // Save on Enter in title field
  $("input-title").addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveBookmark(tabData);
  });

  // Focus title field
  setTimeout(() => $("input-title").focus(), 50);
}

// ── Saved state actions ───────────────────────────────────────────────────────
$("btn-open-linkdeck-2").addEventListener("click", () => {
  chrome.tabs.create({ url: getBaseUrl() });
});

$("btn-save-another").addEventListener("click", () => {
  $("saved-badge").hidden = true;
  init();
});

// ── Error state retry ─────────────────────────────────────────────────────────
$("btn-retry").addEventListener("click", () => init());

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
