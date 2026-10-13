#!/usr/bin/env bash
# Keeps the production server alive on port 3111.
#
# Safe to run repeatedly (start, postStartCommand, postAttachCommand, folderOpen):
#   * no-ops when the server is already answering
#   * rebuilds whenever the production build is missing or stale
#   * supervises `next start`, restarting it if it ever crashes
set -u
cd "$(dirname "$0")/.."
PORT="${PORT:-3111}"
LOG=".data/serve.log"
URL="http://127.0.0.1:$PORT/"

is_up() { curl -sS -o /dev/null -m 2 "$URL" 2>/dev/null; }

if is_up; then
  echo "already serving on :$PORT"
  exit 0
fi

mkdir -p .data

# A production build is only valid when `.next/BUILD_ID` exists. Running
# `next dev` (or an interrupted build) leaves a `.next` directory WITHOUT that
# file, and `next start` then fails forever with:
#   "Could not find a production build in the '.next' directory"
# The old check (`[ ! -d .next ]`) missed this case, which is why the link kept
# breaking after the codespace resumed.
build_needed() {
  [ -f .next/BUILD_ID ] || return 0
  local newer
  newer="$(find src public scripts \
      package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs \
      -newer .next/BUILD_ID -print -quit 2>/dev/null)"
  [ -n "$newer" ]
}

if build_needed; then
  echo "no valid production build - building (log: $LOG)"
  if ! npx next build >>"$LOG" 2>&1; then
    echo "build failed - see $LOG" >&2
    exit 1
  fi
fi

echo "starting server on :$PORT (log: $LOG)"
export PORT LOG
nohup bash -c '
  while true; do
    if [ ! -f .next/BUILD_ID ]; then
      npx next build >>"$LOG" 2>&1 || { sleep 5; continue; }
    fi
    npx next start -p "$PORT" >>"$LOG" 2>&1
    echo "next start exited ($?), restarting in 3s" >>"$LOG"
    sleep 3
  done
' >/dev/null 2>&1 &

for _ in $(seq 1 60); do
  is_up && break
  sleep 1
done

if is_up; then
  echo "ready: $URL"
else
  echo "failed to start - see $LOG" >&2
  exit 1
fi
