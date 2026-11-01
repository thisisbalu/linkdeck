# Linkdeck

A local-first bookmark manager that replaces Chrome's new tab page.

- **Smart bookmarks** — paste a URL (or save from the extension) and the title, category, tags and favicon are filled in automatically using URL rules and page metadata.
- **Organised by category** with pinning, drag-and-drop ordering, moving bookmarks between categories, search and a command palette (⌘K).
- **Tidy up** — review everything in *General* with suggested categories, and teach Linkdeck which category each site belongs to.
- **Keyboard-first** search with filters and typo-tolerant matching, **undo** for deletes, and **bulk** pin/move/delete.
- **Most used / Recent** sorting, a **dead-link checker**, and **export** to Chrome-compatible HTML or a full JSON backup.
- **Chrome extension** — makes Linkdeck your new tab page; save the current tab in one click (Option+Shift+S) or right-click any page or link.
- **Local only** — data lives in `data/bookmarks.json` on your machine; the server only listens on `127.0.0.1`.

Built with Next.js 15 (App Router), React 19, Tailwind CSS and shadcn/ui.

## Quick start

```sh
npm install
npm run service:install   # build + run in the background at http://localhost:3000, starts at login
npm run service:doctor    # confirm everything is set up
```

Then load the Chrome extension (see [chrome-extension/README.md](chrome-extension/README.md)) and open a new tab.

## Start automatically at login

Linkdeck runs as a macOS **login service** (a launchd LaunchAgent, `com.linkdeck.server`). Once installed, macOS starts it every time you log in — after a restart, a shutdown or a log-out — and restarts it within seconds if it ever stops. There is nothing to open by hand.

**Set it up (once per Mac)**

1. Install Node.js 20 or newer from [nodejs.org](https://nodejs.org) (only needed for setup — Linkdeck keeps its own copy).
2. In the project folder, run:
   ```sh
   npm install
   npm run service:install
   ```
   This builds the app, copies Node into `.linkdeck/runtime/node` (so upgrading or removing your Node install never stops Linkdeck), creates `~/Library/LaunchAgents/com.linkdeck.server.plist` and starts it. It ends with `✓ Linkdeck is serving build … at http://localhost:3000`.
3. macOS may show a **“Background Items Added”** notification. Leave it **allowed**. Linkdeck appears in **System Settings → General → Login Items & Extensions → Allow in the Background** as **“Node.js Foundation”** (macOS names it after the Node program it runs) — keep that switch **on**.
4. Load the Chrome extension and choose **Keep it** for the new tab page (see [chrome-extension/README.md](chrome-extension/README.md)).
5. Check everything:
   ```sh
   npm run service:doctor
   ```
   Every line should be ✓ and it should end with *“All good — Linkdeck will start by itself every time you log in.”* Anything marked ✗ comes with the exact command or setting to fix it.
6. (Optional) Restart your Mac and open a new tab — Linkdeck should be there without running anything.

**What happens at login**

- Linkdeck is usually answering within a second of login.
- If Chrome opens a new tab before Linkdeck is ready, the tab shows *“Linkdeck isn't running”* and connects by itself a few seconds later.
- If your data is in iCloud Drive, Box or OneDrive and that app hasn't finished starting, the page shows *“Waiting for your data folder…”* and loads by itself as soon as the folder is available — it never shows an empty list or saves over your data meanwhile.

**Keeping it working**

| Situation | Do this |
|---|---|
| You changed Linkdeck's code | `npm run service:restart` (no downtime) |
| You upgraded Node and want Linkdeck to use it | `npm run service:update-node` |
| You moved or renamed the project folder | `npm run service:install` (from the new location) |
| Something seems wrong | `npm run service:doctor`, then `npm run service:logs` |
| Linkdeck didn't start after login | Check the *Allow in the Background* switch (step 3), then `npm run service:install` |
| You want to stop it starting at login | `npm run service:uninstall` (your data isn't touched; `service:install` brings it back) |

## Running

| Command | What it does |
|---|---|
| `npm run service:install` | Builds and installs a macOS login service (launchd) serving the production build on `127.0.0.1:3000`. Starts at every login; if it stops, macOS restarts it within seconds. |
| `npm run service:restart` | Builds the current code and switches to it **with no downtime** — run this after changing code. If the build fails, the running app is left untouched. |
| `npm run service:status` | Shows whether the service is running and which build is live. |
| `npm run service:doctor` | Checks everything needed to start at login and keep running, with a fix for each problem. |
| `npm run service:update-node` | Re-copies your current Node into `.linkdeck/runtime/node` and restarts the service on it. |
| `npm run service:logs` | Follows the log at `~/Library/Logs/linkdeck.log`. |
| `npm run service:uninstall` | Stops and removes the service. |
| `npm run dev` | Development server with hot reload on `http://localhost:3001` (uses `.next-dev/`, so it can run alongside the service). |
| `npm test` | Runs the Vitest suite. |
| `npm run icons` | Regenerates the app and extension icons from `public/favicon.svg` (edit that file to change the logo). |
| `npm run data:where` / `npm run data:move -- "<folder>"` | Show or change where your data lives (see *Storage location*). |
| `npm run favicons:repair` | Re-fetches missing or broken favicons (`-- --all` to refresh every icon). Safe to run while Linkdeck is running. |

The service runs on Linkdeck's own copy of Node in `.linkdeck/runtime/node` (~115 MB, this Mac's architecture only; if your Node isn't self-contained, e.g. Homebrew's, the matching official build is downloaded from nodejs.org and checksum-verified instead), so changes to your Node install never stop it from starting. Re-run `npm run service:install` if you move the project folder.

**How restarts stay seamless.** launchd runs [`scripts/linkdeck-server.mjs`](scripts/linkdeck-server.mjs), a small supervisor that owns port 3000 and forwards requests to a `next start` process on an internal port (3101+). `service:restart` builds into a fresh `.next-builds/<timestamp>/` folder — never touching the live one — then signals the supervisor, which starts the new build on a spare port, waits until it answers, switches traffic over, and stops the old process once its in-flight requests (e.g. a running link check) finish. The supervisor also serves `/_next/static/*` from the last three builds, so tabs opened before a restart keep working. `GET /__linkdeck/status` shows the live build. Changing `linkdeck-server.mjs` itself needs `npm run service:install` (a one-second restart); everything else only needs `service:restart`.

## Using Linkdeck

| Key | Action |
|---|---|
| `/` or `⌘F` | Search |
| `↑` `↓` then `↵` | Select a search result and open it (`⌘↵` opens in a new tab) |
| `Esc` | Close search |
| `N` | Add a bookmark |
| `⌘K` | Command palette (search, add, tidy up) — `↵` opens a bookmark in this tab, `⌘↵` in a new tab |
| `⌘Z` | Undo the last delete (while the Undo toast is showing) |
| `Esc` | Leave selection mode |

**Search** matches titles, sites, categories, tags, descriptions and URLs, tolerating typos (`nomda` → Nomad) and abbreviations (`gthb` → GitHub). Narrow it with filters — the same filter twice means *or*, different filters mean *and*:

| Filter | Matches |
|---|---|
| `cat:ibm` / `cat:"okta / sso"` | category contains the text |
| `tag:docs` | any tag contains the text |
| `site:github.com` | site contains the text |
| `is:pinned`, `is:unpinned` | pin state |
| `is:broken`, `is:unreachable`, `is:restricted` | result of the last link check |
| `is:unused` | never opened from Linkdeck |

**Sorting** — the toggle under the greeting switches between three views. The **Pinned** strip always keeps your manual order.

- **Manual** — the category grid in your drag-and-drop order (the only view with drag-and-drop).
- **Most used** — one ranked list across all categories: rank, site, category, a usage bar and a count (hover it for the breakdown). Top 25 by default, with *Show all* and a collapsed *Not opened yet* section.
- **Recent** — a timeline grouped into *Today*, *Yesterday*, *Last 7 days*, *Last 30 days* and *Earlier*.

Usage comes from two places: bookmarks you open from Linkdeck (grid, Pinned, search, ⌘K, new tab page), and — with the Chrome extension — your visits to **bookmarked pages** anywhere in Chrome over the last 90 days. A Chrome visit counts when it's that exact page (a trailing `/` or an in-page `#section` doesn't matter; sub-pages and reloads don't count; app routes like `w3.ibm.com/#/apps/…` count as their own page). Because opening a bookmark from Linkdeck is also a Chrome visit, the two are not added together — the larger count is used. The extension syncs at startup, every 15 minutes and whenever you open a new tab; the view says when it last synced.

**More actions (⋯ menu)**
- **Select multiple** — click bookmarks to select them (or *Select all*, which respects the current search), then Pin, Unpin, Move to a category or Delete (undoable).
- **Check for dead links** — requests every bookmark from this computer (HEAD, falling back to GET; 6 at a time, 8 s timeout) and lists *Broken* (404/410), *Unreachable* (DNS, timeouts, server errors — internal sites may just need VPN) and *Needs sign-in* (401/403, and 404s from GitHub/GitLab/Bitbucket, which hide private pages). Broken and unreachable bookmarks get a warning icon; results are kept in `data/link-status.json` until the next check.
- **Export for Chrome (.html)** — a standard bookmark file with one folder per category; import it via Chrome's Bookmark Manager → ⋮ → Import.
- **Export full backup (.json)** — every field plus your site rules.
- **Restore from backup…** — see *Data and backups* below.
- **Import from browser** — the existing HTML importer.

**Deleting** hides the bookmark immediately and shows an *Undo* toast; it's removed for good after 6 seconds, or straight away if you close the tab or delete something else.

**Categories.** New bookmarks are filed using, in order: your site rules, the built-in URL/title rules, then whatever category other bookmarks from the same site use. Anything left over goes to *General*.

- **Site rules** — when you change a bookmark's category (Edit dialog, or the Add preview), tick *Always file bookmarks from &lt;site&gt; under &lt;category&gt;* (on by default) to remember it. Rules are stored in `data/category-rules.json` and match the exact site (e.g. `figma.com`).
- **Tidy up** (wand icon, badge shows how many are in General) lists every *General* bookmark with a suggestion where one exists — including when a category name appears in the site or title (e.g. `Thanks@IBM` → IBM). Adjust, untick, and apply; *Remember for future bookmarks* creates site rules for what you moved. Existing rules are listed there and can be removed.
- Dragging a bookmark to another category moves just that bookmark; it doesn't create a rule.

## Data and backups

- Everything lives in one **data folder** — by default `data/` in the project, or a folder you choose (see *Storage location* below): `bookmarks.json`, `category-rules.json`, `link-status.json`, `usage-sync.json`, `backups/` and the cached site icons in `favicons/`.
- Writes are atomic (temp file + rename) and serialized with lock files, so concurrent saves never overwrite each other — even across processes (the service, `npm run dev` and scripts can all run at once) — and a crash can't leave a half-written file. Locks live in the machine-local `.linkdeck/` folder (never synced); a lock left by a crashed process is cleared automatically.
- Before a write, the current file is copied to `data/backups/<name>-<timestamp>.json` if its newest backup is more than an hour old. The newest 48 backups of each file are kept.
- **To restore**, open ⋯ → *Restore from backup…* (or ⌘K → "Restore from backup"). Pick a backup to see what would change — which bookmarks come back, disappear or revert — then restore it. Your current data is always saved as a new backup first, so a restore can be undone by restoring that one. *Back up now* takes a snapshot on demand, and *Choose file…* restores bookmarks and site rules from an *Export full backup (.json)* file (or a plain `bookmarks.json`).
- `data/`, `data.previous-*/`, `linkdeck.config.json` and `.linkdeck/` are git-ignored — they contain your personal (and possibly internal) URLs or machine-local state.

## Storage location (Box, OneDrive, …)

Keep your data in a cloud-synced folder so it's backed up off this Mac and can be shared with another Mac: **⋯ → Storage location…** (or ⌘K → "Storage location").

- Pick a suggested folder (Linkdeck finds Box, OneDrive, Dropbox, Google Drive and iCloud Drive under `~/Library/CloudStorage`) or type any path. Your bookmarks include internal links, so prefer IBM-managed storage (Box, OneDrive-IBM).
- **Move here** copies everything, checks every file's checksum, then switches — immediately, without a restart. The project's old `data/` folder is kept as `data.previous-<date>`; a cloud folder you move away from is left untouched (another Mac may still use it).
- The target must be a new folder, an empty one, or one that already holds Linkdeck data. If it already has data (e.g. from another Mac) you choose **Use the data that's there** or **Replace it with this Mac's** (the folder's data is kept as backups first).
- From the terminal: `npm run data:where`, `npm run data:move -- "<folder>"` (add `--use-existing` or `--replace` when asked), `npm run data:move -- --default` to come back to the project folder.
- The choice is saved in `linkdeck.config.json`; `LINKDECK_DATA_DIR` overrides it (used by tests and development).

**Using it on several Macs** — point each Mac's Linkdeck at the same folder:
- Changes made on one Mac show up on the other when you switch back to its tab.
- *Most used* / *Recent* add up each Mac's Chrome history (each Mac's extension reports its own; hover a count to see the split).
- If two Macs save at the same moment, the cloud drive keeps both versions (e.g. `bookmarks (1).json`). Linkdeck shows a banner: **Merge** (keeps every bookmark from both; where both have the same one, this Mac's version wins and usage counts are combined), **Keep mine** or **Keep theirs**. The other copy is always kept as a backup.
- If the folder can't be read — the cloud app isn't running, you're signed out, or a file is still downloading — Linkdeck says so and refuses to save until it's back, instead of showing (and then overwriting) an empty list. In Finder, right-click the Linkdeck folder → **Always keep on this device** so files are never "online-only".

## Security

Linkdeck has no login, so it is locked down to your machine:

- The server binds to `127.0.0.1` only — it is not reachable from the network.
- Requests whose `Host` isn't `localhost`/`127.0.0.1`/`[::1]` are rejected (prevents DNS-rebinding attacks).
- API writes are only accepted from Linkdeck itself, the Chrome extension, or non-browser clients like `curl`, and must be `application/json` (prevents other websites from adding or deleting bookmarks).
- Pages can only be embedded by Linkdeck itself or a Chrome extension (`frame-ancestors`).

See [middleware.ts](middleware.ts) and [lib/request-guard.ts](lib/request-guard.ts).

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/bookmarks` | All bookmarks. Add `?url=<url>` to look up one URL. |
| `POST` | `/api/bookmarks` | `{ url, title?, description?, faviconUrl? }` → `201`, or `409` with the existing bookmark if the URL is already saved. |
| `PATCH` | `/api/bookmarks/:id` | Any of `title`, `url`, `description`, `category`, `tags`, `pinned`. Other fields are rejected. |
| `DELETE` | `/api/bookmarks/:id` | Deletes a bookmark. |
| `POST` | `/api/bookmarks/bulk` | `{ action: "pin" \| "unpin" \| "delete", ids }` or `{ action: "move", ids, category }`. |
| `POST` | `/api/bookmarks/:id/visit` | Counts an open (for Most used / Recent). |
| `GET` | `/api/bookmarks/export?format=html\|json` | Download all bookmarks. |
| `GET` | `/api/links` | Last link-check result per bookmark. |
| `POST` | `/api/usage/chrome` | `{ items: [{ id, visits, lastVisitAt }] }` — Chrome-history counts from the extension. |
| `GET` | `/api/usage/status` | When the extension last synced usage. |
| `POST` | `/api/links/check` | `{}` or `{ ids }` — checks links, streaming one JSON line per result. |
| `GET` | `/api/backups` | Backups of bookmarks and site rules, newest first, with counts. |
| `POST` | `/api/backups` | Take a backup now. |
| `GET` | `/api/backups/:name` | Preview: what restoring this backup would change. |
| `POST` | `/api/backups/:name/restore` | Restore it (current data is backed up first). |
| `POST` | `/api/backups/restore-file` | Body: an exported full-backup JSON or a bookmarks array. |
| `GET` | `/api/storage` | Data folder, availability, conflict copies, suggested cloud folders. |
| `POST` | `/api/storage/move` | `{ target, mode?: "auto" \| "replace" \| "use-existing" }` — `409 { needsChoice }` if the folder already has data. |
| `POST` | `/api/storage/conflicts` | `{ file, action: "merge" \| "keep-mine" \| "keep-theirs" }`. |
| `POST` | `/api/bookmarks/reorder` | `{ items: [{ id, sortOrder, category? }] }` — persists drag-and-drop. |
| `GET` | `/api/bookmarks/enrich?url=&title=` | Category/tag preview without saving (used by the extension). |
| `GET` | `/api/bookmarks/categorize` | Suggestions for bookmarks in *General*, plus site rules and known categories. |
| `POST` | `/api/bookmarks/categorize` | `{ items: [{ id, category }], remember? }` — bulk move; `remember` also saves site rules. |
| `GET` | `/api/category-rules` | All site rules `{ rules: { host: category } }`. |
| `PUT` | `/api/category-rules` | `{ url, category }` — file future bookmarks from that site under `category`. |
| `DELETE` | `/api/category-rules?host=` | Remove a site rule. |

## Project layout

```
app/                 Next.js pages and API routes
components/          UI (HomeClient is the main page)
lib/                 Data folder + storage moves, conflicts, enrichment, validation, backups, request guard
middleware.ts        Applies the request guard to every request
chrome-extension/    New tab override + save-current-tab popup
scripts/service.sh   launchd service management (install / zero-downtime restart / status)
scripts/linkdeck-server.mjs  supervisor: proxy on :3000, blue/green swaps, crash restarts
tests/               Vitest tests
```
