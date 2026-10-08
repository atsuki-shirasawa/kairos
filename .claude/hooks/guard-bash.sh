#!/bin/bash
# PreToolUse (Bash): block commands that would damage the everyday Kairos install.
# exit 2 rejects the call and returns the stderr reason to Claude.
cmd=$(jq -r '.tool_input.command // empty')
[ -n "$cmd" ] || exit 0
real_dir="$HOME/Library/Application Support/kairos"

# A second server without KAIROS_DATA_DIR overwrites the real kairos.pid, after which
# `kairos stop` / `restart` lose track of the running daemon. Only matters while it is running.
starts_server='(^|[;&|(]|\s)bun\s+(run\s+)?(dev|dev:server|start)(\s|$|[;&|)])|(kairos|index\.ts)\s+serve\b'
if grep -qE "$starts_server" <<<"$cmd" && ! grep -q 'KAIROS_DATA_DIR=' <<<"$cmd"; then
  pid=$(cut -d' ' -f1 "$real_dir/kairos.pid" 2>/dev/null)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo "The background kairos server (PID $pid) is running. Starting another server without KAIROS_DATA_DIR overwrites its PID file. Set KAIROS_DATA_DIR=<scratchpad>/kairos-data, or ask the user before running \`kairos stop\`." >&2
    exit 2
  fi
fi

# The everyday DB holds summaries that cost claude -p runs to produce; only read it.
if grep -qE '\bsqlite3\b' <<<"$cmd" && grep -qE 'Application(\\ | |%20)Support/kairos' <<<"$cmd" &&
  ! grep -qE '(^|\s)-readonly\b' <<<"$cmd"; then
  echo "Open the everyday DB read-only: sqlite3 -readonly ~/Library/Application\\ Support/kairos/kairos.db. Schema changes go through MIGRATIONS (/add-migration)." >&2
  exit 2
fi
exit 0
