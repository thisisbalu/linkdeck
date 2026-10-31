# Linkdeck — Chrome Extension

Makes your local Linkdeck the Chrome **new tab page**, and adds one-click bookmarking from any browser tab, including auth-gated pages.

## Install (one-time)

1. Open **chrome://extensions** in Chrome
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked** → select this `chrome-extension/` folder
4. Pin the **Linkdeck** icon to your toolbar (puzzle icon → pin)

> Linkdeck must be running. Install it as a background service once with `npm run service:install` (serves port 3000 and starts at login).

## New tab page

Every new tab shows Linkdeck (embedded from `http://localhost:<port>`).
Chrome asks once whether to keep the extension's new tab page — choose **Keep it**.

- Clicking a bookmark opens it in the same tab.
- If Linkdeck isn't running, the tab shows a reminder and reconnects automatically once it's up.

## Saving the current tab

1. Navigate to any page
2. Click the **Linkdeck** icon in the toolbar
3. The popup reads the **real page title** from the browser tab (works on SharePoint, Jira, Grafana, Notion — anything)
4. Edit title / description if needed
5. Click **Save bookmark** — done ✓

## Right-click and keyboard shortcut

- **Right-click a page** → *Save page to Linkdeck*, or **right-click a link** → *Save link to Linkdeck*. Saves instantly without opening the popup; the toolbar icon shows **✓** (saved), **=** (already saved) or **!** (error — hover the icon for details).
- **Option+Shift+S** (Alt+Shift+S on Windows/Linux) opens the save popup for the current tab. Change it at `chrome://extensions/shortcuts`.

## Features

- **Real title** — reads `document.title` directly, no URL guessing
- **Real favicon** — reads `<link rel="icon">` from the tab
- **Duplicate detection** — shows "Already saved" if the URL exists (Linkdeck also rejects duplicate URLs)
- **Category + tags preview** — fetched from Linkdeck's enrichment API
- **Configurable port** — change the port in the popup if needed (default: 3000)
- **Enter to save** — keyboard friendly
- **Usage sync** — visits to bookmarked pages anywhere in Chrome feed Linkdeck's *Most used* and *Recent* views (synced at startup, every 15 minutes, and when you open a new tab)
- **Already-saved indicator** — the toolbar icon shows **★** on any page that's already in Linkdeck (hover it to see the bookmark's title and category)
- **Toolbar badge** — briefly shows ✓ after saving

## Permissions

| Permission | Why |
|---|---|
| `tabs` | Read the current tab's URL to show ★ when it's already saved. URLs are sent only to your local Linkdeck. |
| `history` | Count your visits to **bookmarked pages only** (last 90 days) for Linkdeck's *Most used* and *Recent* views. Nothing else in your history is read; counts are sent only to your local Linkdeck. |
| `alarms` | Re-sync those counts every 15 minutes. |
| `activeTab`, `scripting` | Read the real page title and favicon when you open the popup. |
| `contextMenus` | Right-click "Save page/link to Linkdeck". |
| `storage` | Remember Linkdeck's port. |
| `http://localhost/*` | Talk to Linkdeck. |

## Port configuration

The extension defaults to `localhost:3000` (the background service). To point it at the dev server (`npm run dev`, port 3001) or another port:
- Open the extension popup on any page
- Change the port number at the bottom
- It's remembered across sessions and also used by the new tab page (open a new tab after changing it)

## Files

```
manifest.json   — Extension manifest (MV3)
popup.html      — Popup UI shell
popup.js        — All popup logic
popup.css       — Dark zinc theme
newtab.html     — New tab override (embeds Linkdeck)
newtab.js       — New tab logic (reachability check, in-tab navigation)
newtab.css      — New tab styles
background.js   — Service worker (badge, right-click save, usage sync)
usage.js        — Matches Chrome history visits to bookmarked pages
icons/          — Extension icons (generated from public/favicon.svg by `npm run icons`)
```
