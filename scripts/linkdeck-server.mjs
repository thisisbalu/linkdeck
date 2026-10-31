#!/usr/bin/env node
/**
 * Linkdeck supervisor — zero-downtime restarts.
 *
 * Owns http://127.0.0.1:$LINKDECK_PORT (default 3000) and proxies to a
 * `next start` backend on an internal port. On SIGHUP it starts the build
 * named in .next-builds/ACTIVE on a spare port, waits until it answers,
 * switches traffic over, lets in-flight requests on the old backend finish,
 * then stops it. Requests never see a gap.
 *
 * It also serves /_next/static/* straight from disk, looking in the active
 * build first and then the previous ones, so tabs opened before a restart can
 * still load their (content-hashed) JS/CSS.
 *
 *   GET /__linkdeck/status   → which build/port is live (used by scripts/service.sh)
 *
 * Started by launchd via scripts/service.sh; not meant to be run by hand.
 */

import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const PORT = Number(process.env.LINKDECK_PORT || 3000);
const BUILDS_DIR = path.join(ROOT, ".next-builds");
const ACTIVE_FILE = path.join(BUILDS_DIR, "ACTIVE");
const PIDS_FILE = path.join(BUILDS_DIR, `backends-${PORT}.pid`);
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const KEEP_BUILDS = 3;
const HEALTH_TIMEOUT_MS = 90_000;
const DRAIN_TIMEOUT_MS = 30_000;

const MIME = {
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const log = (...args) => console.log(new Date().toISOString(), "[linkdeck]", ...args);

/** @typedef {{ build: string, port: number, child: import("node:child_process").ChildProcess, inflight: number, exited: boolean, startedAt: string }} Backend */

/** @type {Backend | null} */
let active = null;
/** @type {Set<Backend>} */
const backends = new Set();
let switching = false;
let reloadQueued = false;
let shuttingDown = false;
let lastCrash = 0;

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readActiveBuild() {
  const id = fs.readFileSync(ACTIVE_FILE, "utf-8").trim();
  if (!/^[\w.-]+$/.test(id) || !fs.existsSync(path.join(BUILDS_DIR, id, "BUILD_ID"))) {
    throw new Error(`.next-builds/ACTIVE points at "${id}", which is not a complete build`);
  }
  return id;
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(port, HOST, () => s.close(() => resolve(true)));
  });
}

async function pickPort() {
  for (let p = PORT + 101; p <= PORT + 120; p++) {
    if ([...backends].some((b) => b.port === p)) continue;
    if (await portFree(p)) return p;
  }
  throw new Error("No free internal port");
}

function savePids() {
  try {
    fs.writeFileSync(PIDS_FILE, [...backends].map((b) => b.child.pid).filter(Boolean).join("\n"));
  } catch { /* best effort */ }
}

/** Stops backends orphaned by a previous supervisor that was killed hard. */
function killOrphans() {
  let pids = [];
  try { pids = fs.readFileSync(PIDS_FILE, "utf-8").split(/\s+/).filter(Boolean).map(Number); } catch { return; }
  for (const pid of pids) {
    try {
      const cmd = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf-8" });
      // Next renames its process to "next-server (vX)"; older versions show "next start".
      if (cmd.includes("next-server") || (cmd.includes("next") && cmd.includes("start"))) {
        process.kill(pid, "SIGTERM");
        log(`stopped orphaned backend pid ${pid}`);
      }
    } catch { /* not running */ }
  }
  try { fs.unlinkSync(PIDS_FILE); } catch { /* ignore */ }
}

async function waitHealthy(backend) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (backend.exited) throw new Error(`backend for ${backend.build} exited during startup`);
    const ok = await new Promise((resolve) => {
      const req = http.get({ host: HOST, port: backend.port, path: "/", timeout: 5000 }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => { req.destroy(); resolve(false); });
    });
    if (ok) return;
    await sleep(200);
  }
  throw new Error(`backend for ${backend.build} did not become healthy in ${HEALTH_TIMEOUT_MS / 1000}s`);
}

// ── Backends ─────────────────────────────────────────────────────────────────

async function startBackend(build) {
  const port = await pickPort();
  const child = spawn(process.execPath, [NEXT_BIN, "start", "-H", HOST, "-p", String(port)], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production", NEXT_DIST_DIR: `.next-builds/${build}` },
    stdio: ["ignore", "inherit", "inherit"],
  });
  /** @type {Backend} */
  const backend = { build, port, child, inflight: 0, exited: false, startedAt: new Date().toISOString() };
  backends.add(backend);
  savePids();

  child.on("exit", (code, signal) => {
    backend.exited = true;
    backends.delete(backend);
    savePids();
    if (shuttingDown) return;
    if (backend === active) {
      log(`active backend (${build} :${port}) exited unexpectedly (code ${code}, signal ${signal}); restarting`);
      active = null;
      const wait = Date.now() - lastCrash < 30_000 ? 5000 : 500;
      lastCrash = Date.now();
      setTimeout(() => reload("crash recovery"), wait);
    }
  });

  try {
    await waitHealthy(backend);
  } catch (err) {
    child.kill("SIGKILL");
    throw err;
  }
  return backend;
}

async function stopBackend(backend) {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  while (backend.inflight > 0 && Date.now() < deadline) await sleep(100);
  if (backend.exited) return;
  backend.child.kill("SIGTERM");
  const killTimer = setTimeout(() => { if (!backend.exited) backend.child.kill("SIGKILL"); }, 5000);
  await new Promise((r) => backend.child.once("exit", r));
  clearTimeout(killTimer);
  log(`stopped old backend (${backend.build} :${backend.port})`);
}

function pruneBuilds() {
  let dirs;
  try {
    dirs = fs.readdirSync(BUILDS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort().reverse();
  } catch { return; }
  const inUse = new Set([...backends].map((b) => b.build));
  const complete = dirs.filter((d) => fs.existsSync(path.join(BUILDS_DIR, d, "BUILD_ID")));
  const keep = new Set([...inUse, ...complete.slice(0, KEEP_BUILDS)]);
  for (const d of dirs) {
    if (keep.has(d)) continue;
    const full = path.join(BUILDS_DIR, d);
    // A directory without BUILD_ID may be a build in progress; only remove it once stale.
    if (!complete.includes(d) && Date.now() - fs.statSync(full).mtimeMs < 60 * 60 * 1000) continue;
    fs.rmSync(full, { recursive: true, force: true });
    log(`removed old build ${d}`);
  }
}

/** Starts the ACTIVE build on a new port and switches traffic to it. */
async function reload(reason) {
  if (shuttingDown) return;
  if (switching) { reloadQueued = true; return; }
  switching = true;
  try {
    const build = readActiveBuild();
    log(`starting build ${build} (${reason})`);
    const next = await startBackend(build);
    const old = active;
    active = next;
    log(`now serving build ${build} via :${next.port}`);
    if (old) stopBackend(old).then(pruneBuilds);
    else pruneBuilds();
  } catch (err) {
    log(`reload failed — ${active ? "still serving the previous build" : "no backend available"}: ${err.message}`);
    if (!active) setTimeout(() => reload("retry after failure"), 5000);
  } finally {
    switching = false;
    if (reloadQueued) { reloadQueued = false; reload("queued reload"); }
  }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

function unavailable(req, res) {
  if (res.headersSent) { res.destroy(); return; }
  const wantsHtml = (req.headers.accept || "").includes("text/html");
  res.writeHead(503, {
    "Content-Type": wantsHtml ? "text/html; charset=utf-8" : "application/json",
    "Retry-After": "1",
    "Cache-Control": "no-store",
  });
  res.end(wantsHtml
    ? '<!doctype html><meta http-equiv="refresh" content="1"><title>Starting…</title><body style="font:14px -apple-system;background:#09090b;color:#a1a1aa;display:grid;place-items:center;height:100vh;margin:0">Linkdeck is starting…</body>'
    : JSON.stringify({ error: "Linkdeck is starting, try again in a moment" }));
}

/** Serves immutable build assets from disk; returns false to fall through to the backend. */
function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const pathname = (req.url || "").split("?")[0];
  if (!pathname.startsWith("/_next/static/")) return false;

  let rel;
  try { rel = decodeURIComponent(pathname.slice("/_next/static/".length)); } catch { return false; }
  let builds;
  try {
    builds = fs.readdirSync(BUILDS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort().reverse();
  } catch { return false; }
  if (active) builds = [active.build, ...builds.filter((b) => b !== active.build)];

  for (const build of builds) {
    const base = path.join(BUILDS_DIR, build, "static");
    const file = path.resolve(base, rel);
    if (!file.startsWith(base + path.sep)) return false;
    let stat;
    try { stat = fs.statSync(file); } catch { continue; }
    if (!stat.isFile()) continue;
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(file).pipe(res);
    return true;
  }
  return false;
}

function forward(req, res) {
  const backend = active;
  if (!backend || backend.exited) return unavailable(req, res);

  backend.inflight++;
  let finished = false;
  const finish = () => { if (!finished) { finished = true; backend.inflight--; } };

  const upstream = http.request(
    { host: HOST, port: backend.port, method: req.method, path: req.url, headers: req.headers },
    (up) => {
      const headers = { ...up.headers };
      delete headers.connection;
      delete headers["keep-alive"];
      res.writeHead(up.statusCode || 502, up.statusMessage, headers);
      up.pipe(res);
      up.on("end", finish);
      up.on("error", () => { finish(); res.destroy(); });
    }
  );
  upstream.on("error", () => { finish(); unavailable(req, res); });
  // If the browser goes away (e.g. a streaming link check is cancelled), tell the backend.
  res.on("close", () => { if (!res.writableFinished) upstream.destroy(); finish(); });
  req.pipe(upstream);
}

/** Same rule as the app's middleware: only loopback Host headers (blocks DNS rebinding). */
function hostAllowed(host) {
  const h = (host || "").toLowerCase();
  const name = h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0];
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}

const server = http.createServer((req, res) => {
  if (!hostAllowed(req.headers.host)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Host not allowed" }));
    return;
  }
  if (req.url === "/__linkdeck/status") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({
      build: active?.build ?? null,
      port: active?.port ?? null,
      startedAt: active?.startedAt ?? null,
      switching,
      backends: [...backends].map((b) => ({ build: b.build, port: b.port, inflight: b.inflight })),
      supervisorPid: process.pid,
    }));
    return;
  }
  if (serveStatic(req, res)) return;
  forward(req, res);
});
server.keepAliveTimeout = 65_000;

// ── Lifecycle ────────────────────────────────────────────────────────────────

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`${signal} received, shutting down`);
  server.close();
  await Promise.all([...backends].map((b) => {
    b.child.kill("SIGTERM");
    return new Promise((r) => { b.child.once("exit", r); setTimeout(r, 5000); });
  }));
  try { fs.unlinkSync(PIDS_FILE); } catch { /* ignore */ }
  process.exit(0);
}

process.on("SIGHUP", () => reload("SIGHUP"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

fs.mkdirSync(BUILDS_DIR, { recursive: true });
killOrphans();
server.on("error", (err) => {
  log(`cannot listen on ${HOST}:${PORT}: ${err.message}`);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  log(`listening on http://${HOST}:${PORT}`);
  reload("startup");
});
