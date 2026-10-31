#!/bin/sh
# Linkdeck doctor — checks everything needed for Linkdeck to start at login
# and keep running, and says exactly how to fix anything that's wrong.
#
#   npm run service:doctor
#
# Exit code: 0 if everything that matters is OK, 1 otherwise.

LABEL="com.linkdeck.server"
PORT="${LINKDECK_PORT:-3000}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/linkdeck.log"
DOMAIN="gui/$(id -u)"
RUNTIME_NODE="$PROJECT_DIR/.linkdeck/runtime/node"
BASE="http://127.0.0.1:$PORT"

FAILED=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '      → %s\n' "$2"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '      → %s\n' "$2"; FAILED=1; }

# A Node to parse JSON with (Linkdeck's own, or the system one).
JSNODE="$RUNTIME_NODE"; [ -x "$JSNODE" ] || JSNODE="$(command -v node || true)"
json() { # json '<js expression on d>' < input
  [ -n "$JSNODE" ] || { cat >/dev/null; echo "?"; return; }
  "$JSNODE" -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{try{const d=JSON.parse(s);console.log($1)}catch{console.log('?')}})"
}

echo "Linkdeck doctor"
echo
echo "Starts at login"

if [ ! -f "$PLIST" ]; then
  bad "Login service isn't installed" "npm run service:install"
else
  ok "Login service installed ($PLIST)"
  RUN_AT_LOAD="$(plutil -extract RunAtLoad raw "$PLIST" 2>/dev/null)"
  KEEP_ALIVE="$(plutil -extract KeepAlive raw "$PLIST" 2>/dev/null)"
  if [ "$RUN_AT_LOAD" = "true" ] && [ "$KEEP_ALIVE" = "true" ]; then
    ok "Starts at every login and restarts if it stops"
  else
    bad "Not set to start at login / restart (RunAtLoad=$RUN_AT_LOAD, KeepAlive=$KEEP_ALIVE)" "npm run service:install"
  fi
fi

if launchctl print-disabled "$DOMAIN" 2>/dev/null | grep -q "\"$LABEL\" => disabled"; then
  bad "Turned off with launchctl" "launchctl enable $DOMAIN/$LABEL && npm run service:install"
fi

# macOS "Login Items & Extensions → Allow in the Background" (shown as "Node.js Foundation").
BTM="$(sfltool dumpbtm 2>/dev/null | grep -B4 -A4 "Identifier:.*com.linkdeck.server" | grep "Disposition" | head -1)"
case "$BTM" in
  *disallowed*|*disabled*)
    bad "macOS is blocking it from running in the background" \
      "System Settings → General → Login Items & Extensions → Allow in the Background → turn on “Node.js Foundation” (that's Linkdeck)"
    ;;
  *enabled*allowed*) ok "Allowed by macOS (System Settings lists it as “Node.js Foundation”)" ;;
  *) warn "Couldn't read macOS background-item settings" \
      "Check System Settings → General → Login Items & Extensions → Allow in the Background: “Node.js Foundation” should be on" ;;
esac

echo
echo "Runtime"

if [ -x "$RUNTIME_NODE" ] && V="$("$RUNTIME_NODE" -v 2>/dev/null)"; then
  ok "Linkdeck's own Node $V (.linkdeck/runtime/node)"
else
  bad "Linkdeck's own Node is missing or broken" "npm run service:update-node"
fi
if [ -f "$PLIST" ]; then
  if grep -q "$RUNTIME_NODE" "$PLIST"; then
    ok "Login service uses Linkdeck's own Node"
  else
    bad "Login service uses the system Node, which can change or disappear" "npm run service:restart"
  fi
fi
ACTIVE="$(cat "$PROJECT_DIR/.next-builds/ACTIVE" 2>/dev/null || true)"
if [ -n "$ACTIVE" ] && [ -f "$PROJECT_DIR/.next-builds/$ACTIVE/BUILD_ID" ]; then
  ok "App build $ACTIVE is ready"
else
  bad "No complete app build to start" "npm run service:restart"
fi

echo
echo "Running now"

if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  STATE="$(launchctl print "$DOMAIN/$LABEL" | awk -F' = ' '/^\tstate = /{print $2; exit}')"
  PID="$(launchctl print "$DOMAIN/$LABEL" | awk -F' = ' '/^\tpid = /{print $2; exit}')"
  if [ "$STATE" = "running" ]; then ok "Service running (pid $PID)"; else bad "Service loaded but $STATE" "npm run service:logs"; fi
else
  bad "Service isn't loaded" "npm run service:install"
fi

STATUS="$(curl -s --max-time 5 "$BASE/__linkdeck/status" || true)"
if [ -n "$STATUS" ]; then
  LIVE="$(printf '%s' "$STATUS" | json 'd.build')"
  if [ "$LIVE" = "$ACTIVE" ]; then ok "Serving the latest build ($LIVE)"; else warn "Serving build $LIVE, latest is $ACTIVE" "npm run service:restart"; fi
else
  bad "Nothing answering at $BASE" "npm run service:logs, then npm run service:restart"
fi

CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/" || true)"
[ "$CODE" = "200" ] && ok "Page loads at http://localhost:$PORT" || bad "Page returned HTTP $CODE" "npm run service:logs"

STORAGE="$(curl -s --max-time 10 "$BASE/api/storage" || true)"
if [ -n "$STORAGE" ]; then
  AVAILABLE="$(printf '%s' "$STORAGE" | json 'd.available')"
  WHERE="$(printf '%s' "$STORAGE" | json 'd.label + ": " + d.dataDir')"
  COUNT="$(printf '%s' "$STORAGE" | json 'd.summary.bookmarks')"
  if [ "$AVAILABLE" = "true" ]; then
    ok "Data folder reachable — $WHERE ($COUNT bookmarks)"
  else
    warn "Data folder not reachable right now — $WHERE" \
      "If it's in Box/OneDrive, open that app and sign in; Linkdeck reconnects by itself"
  fi
  CONFLICTS="$(printf '%s' "$STORAGE" | json 'd.conflicts.length')"
  [ "$CONFLICTS" != "0" ] && [ "$CONFLICTS" != "?" ] && warn "$CONFLICTS conflict cop(ies) waiting" "Open Linkdeck and choose Merge / Keep mine / Keep theirs in the banner"
fi

echo
echo "History"

if [ -f "$LOG" ]; then
  CRASHES="$(tail -n 2000 "$LOG" | grep -c "exited unexpectedly" || true)"
  STARTS="$(tail -n 2000 "$LOG" | grep -c "listening on" || true)"
  ok "$STARTS start(s) recorded in ~/Library/Logs/linkdeck.log"
  if [ "$CRASHES" -gt 0 ]; then
    warn "$CRASHES unexpected restart(s) in the recent log (Linkdeck recovered by itself)" "npm run service:logs to see why"
  fi
else
  warn "No log yet at ~/Library/Logs/linkdeck.log"
fi

echo
if [ "$FAILED" = 0 ]; then
  echo "All good — Linkdeck will start by itself every time you log in."
else
  echo "Fix the ✗ items above, then run npm run service:doctor again."
fi
exit "$FAILED"
