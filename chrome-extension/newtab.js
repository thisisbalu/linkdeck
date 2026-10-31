/**
 * Linkdeck — New Tab override
 *
 * Embeds the locally running Linkdeck in a full-page iframe. If Linkdeck is
 * not reachable, shows a friendly message and keeps retrying.
 *
 * Clicking a bookmark inside Linkdeck posts a message here so the whole
 * tab navigates (many sites refuse to load inside an iframe).
 */

const DEFAULT_PORT = 3000;
const RETRY_MS = 3000;

const frame = document.getElementById("linkdeck");
const offline = document.getElementById("offline");

let appOrigin = "";
let retryTimer = null;
// The usage sync can finish before the embedded app has loaded, so only
// tell it to refresh once it has announced it's ready.
let appReady = false;
let refreshPending = false;

function notifyAppIfReady() {
  if (!appReady || !refreshPending || !frame.contentWindow) return;
  refreshPending = false;
  frame.contentWindow.postMessage({ type: "linkdeck:usage-updated" }, appOrigin);
}

function getPort() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["port"], (res) => {
      resolve(parseInt(res.port, 10) || DEFAULT_PORT);
    });
  });
}

async function isReachable(origin) {
  try {
    const res = await fetch(`${origin}/favicon.svg`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

async function connect() {
  clearTimeout(retryTimer);
  appOrigin = `http://localhost:${await getPort()}`;

  if (await isReachable(appOrigin)) {
    offline.hidden = true;
    frame.hidden = false;
    if (frame.src !== `${appOrigin}/`) {
      appReady = false;
      frame.src = `${appOrigin}/`;
    }
    syncUsageThenNotify();
    return;
  }

  frame.hidden = true;
  offline.hidden = false;
  document.getElementById("linkdeck-url").textContent = appOrigin;
  retryTimer = setTimeout(connect, RETRY_MS);
}

/** Asks the service worker to sync Chrome-history usage; tells Linkdeck to refresh if counts changed. */
function syncUsageThenNotify() {
  chrome.runtime.sendMessage({ type: "linkdeck:sync-usage" }).then((result) => {
    if (result?.changed > 0) {
      refreshPending = true;
      notifyAppIfReady();
    }
  }).catch(() => {});
}

window.addEventListener("message", (event) => {
  if (event.source !== frame.contentWindow || event.origin !== appOrigin) return;
  const data = event.data;
  if (data?.type === "linkdeck:ready") {
    appReady = true;
    notifyAppIfReady();
    return;
  }
  if (data?.type !== "linkdeck:navigate" || typeof data.url !== "string") return;
  if (!/^https?:\/\//i.test(data.url)) return;
  window.location.href = data.url;
});

document.getElementById("btn-retry").addEventListener("click", connect);

connect();
