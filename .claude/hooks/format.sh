#!/bin/bash
# PostToolUse: Claude が編集したファイルを Biome で整形する（VS Code の保存時整形の代わり）。
# Biome の対象外のファイルは無視する。失敗しても編集自体は止めない。
file=$(jq -r '.tool_input.file_path // empty')
[ -n "$file" ] && [ -f "$file" ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
bunx biome check --write --no-errors-on-unmatched "$file" >/dev/null 2>&1 || true
exit 0
