#!/bin/bash
# PostToolUse: format files Claude edited with Biome (in place of VS Code's format-on-save).
# Files outside Biome's scope are ignored. A failure never blocks the edit itself.
file=$(jq -r '.tool_input.file_path // empty')
[ -n "$file" ] && [ -f "$file" ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
bunx biome check --write --no-errors-on-unmatched "$file" >/dev/null 2>&1 || true
exit 0
