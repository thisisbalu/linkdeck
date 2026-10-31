#!/bin/sh
# Manage the Linkdeck login service (macOS launchd agent).
#
# The service runs scripts/linkdeck-server.mjs, which serves the production
# build on http://127.0.0.1:$PORT, starts at login, restarts crashed backends,
# and swaps in new builds with zero downtime.
#
#   sh scripts/service.sh install      build + install + start (and start at every login)
#   sh scripts/service.sh restart      build + switch to the new build (no downtime)
#   sh scripts/service.sh status       show state and the live build
#   sh scripts/service.sh doctor       check everything needed to start at login, with fixes
#   sh scripts/service.sh update-node  re-copy Node into Linkdeck after upgrading Node
#   sh scripts/service.sh logs         follow the log file
#   sh scripts/service.sh uninstall    stop + remove
#
# The service runs on Linkdeck's own copy of Node (.linkdeck/runtime/node),
# so upgrading, moving or removing your Node install never stops it starting.
set -eu

LABEL="com.linkdeck.server"
PORT="${LINKDECK_PORT:-3000}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILDS_DIR="$PROJECT_DIR/.next-builds"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/linkdeck.log"
DOMAIN="gui/$(id -u)"
RUNTIME_DIR="$PROJECT_DIR/.linkdeck/runtime"
RUNTIME_NODE="$RUNTIME_DIR/node"

is_loaded() {
  launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1
}

status_json() {
  curl -s --max-time 3 "http://127.0.0.1:$PORT/__linkdeck/status" || true
}

# Waits until the supervisor reports it is serving build $1.
wait_serving() {
  i=0
  while [ $i -lt 120 ]; do
    case "$(status_json)" in
      "{\"build\":\"$1\""*)  # the live build is the first field; ignore backends still starting
        echo "✓ Linkdeck is serving build $1 at http://localhost:$PORT"
        return 0
        ;;
    esac
    i=$((i + 1))
    sleep 1
  done
  echo "✗ Linkdeck did not switch to build $1. Check: npm run service:logs" >&2
  return 1
}

# Builds into a fresh .next-builds/<id> folder; the running app is never touched.
build() {
  BUILD_ID_NEW="$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BUILDS_DIR"
  echo "Building production bundle ($BUILD_ID_NEW)…"
  # `next build` rewrites these to point at its output folder; keep them stable.
  SAVED="$(mktemp -d)"
  cp "$PROJECT_DIR/next-env.d.ts" "$PROJECT_DIR/tsconfig.json" "$SAVED/" 2>/dev/null || true
  BUILD_LOG="$SAVED/build.log"
  if (cd "$PROJECT_DIR" && NEXT_DIST_DIR=".next-builds/$BUILD_ID_NEW" npm run build >"$BUILD_LOG" 2>&1); then
    status=0
  else
    status=1
  fi
  cp "$SAVED/next-env.d.ts" "$SAVED/tsconfig.json" "$PROJECT_DIR/" 2>/dev/null || true
  if [ $status -ne 0 ]; then
    tail -n 40 "$BUILD_LOG" >&2
    rm -rf "$SAVED" "$BUILDS_DIR/$BUILD_ID_NEW"
    echo "✗ Build failed — the running app was not changed." >&2
    exit 1
  fi
  rm -rf "$SAVED"
  printf '%s\n' "$BUILD_ID_NEW" > "$BUILDS_DIR/ACTIVE.tmp"
  mv "$BUILDS_DIR/ACTIVE.tmp" "$BUILDS_DIR/ACTIVE"
}

# Copies the current Node into .linkdeck/runtime/node (this Mac's architecture
# only, ~120 MB). Pass "refresh" to replace an existing copy.
ensure_runtime() {
  if [ -x "$RUNTIME_NODE" ] && [ "${1:-}" != "refresh" ] && "$RUNTIME_NODE" -v >/dev/null 2>&1; then
    return 0
  fi
  SRC="$(command -v node || true)"
  [ -n "$SRC" ] || { echo "✗ Node isn't installed — install it from nodejs.org first." >&2; exit 1; }
  SRC="$(cd "$(dirname "$SRC")" && pwd -P)/$(basename "$SRC")"
  mkdir -p "$RUNTIME_DIR"
  TMP_NODE="$RUNTIME_DIR/node.tmp.$$"
  ARCH="$(uname -m)"
  if command -v lipo >/dev/null 2>&1 && [ "$(lipo -archs "$SRC" 2>/dev/null | wc -w | tr -d ' ')" -gt 1 ]; then
    lipo "$SRC" -thin "$ARCH" -output "$TMP_NODE"
  else
    cp "$SRC" "$TMP_NODE"
  fi
  chmod 755 "$TMP_NODE"
  if ! "$TMP_NODE" -v >/dev/null 2>&1; then
    rm -f "$TMP_NODE"
    echo "✗ The copied Node doesn't run — leaving the existing one in place." >&2
    exit 1
  fi
  mv "$TMP_NODE" "$RUNTIME_NODE"
  echo "Linkdeck now has its own Node $("$RUNTIME_NODE" -v) ($ARCH) at .linkdeck/runtime/node"
}

write_plist() {
  ensure_runtime
  NODE_BIN="$RUNTIME_NODE"
  mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
  cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$PROJECT_DIR/scripts/linkdeck-server.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PROJECT_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>LINKDECK_PORT</key>
    <string>$PORT</string>
    <key>PATH</key>
    <string>$(dirname "$NODE_BIN"):/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>$LOG</string>
  <key>StandardErrorPath</key>
  <string>$LOG</string>
</dict>
</plist>
EOF
}

case "${1:-}" in
  install)
    if ! is_loaded && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "Port $PORT is already in use (is another server running?). Stop it first." >&2
      exit 1
    fi
    build
    write_plist
    if is_loaded; then launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true; sleep 1; fi
    launchctl bootstrap "$DOMAIN" "$PLIST"
    wait_serving "$BUILD_ID_NEW"
    ;;
  restart)
    is_loaded || { echo "Service not installed. Run: npm run service:install" >&2; exit 1; }
    if ! grep -q "linkdeck-server.mjs" "$PLIST" 2>/dev/null || ! grep -q "$RUNTIME_NODE" "$PLIST" 2>/dev/null; then
      echo "Upgrading the service (one-time short restart)…"
      exec sh "$0" install
    fi
    build
    launchctl kill SIGHUP "$DOMAIN/$LABEL"
    wait_serving "$BUILD_ID_NEW"
    ;;
  status)
    if is_loaded; then
      launchctl print "$DOMAIN/$LABEL" | grep -E '^\s*(state|pid|last exit code) =' || true
      echo "live: $(status_json)"
    else
      echo "Service not installed."
    fi
    ;;
  update-node)
    ensure_runtime refresh
    if is_loaded; then exec sh "$0" install; fi
    ;;
  doctor)
    exec sh "$PROJECT_DIR/scripts/doctor.sh"
    ;;
  logs)
    touch "$LOG"
    tail -n 50 -f "$LOG"
    ;;
  uninstall)
    if is_loaded; then launchctl bootout "$DOMAIN/$LABEL" || true; fi
    rm -f "$PLIST"
    echo "Service removed."
    ;;
  *)
    echo "Usage: sh scripts/service.sh {install|restart|status|doctor|update-node|logs|uninstall}" >&2
    exit 1
    ;;
esac
