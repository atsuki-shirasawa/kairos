#!/bin/bash
# PreToolUse: block direct edits to generated files. exit 2 rejects the call and returns the stderr reason to Claude.
file=$(jq -r '.tool_input.file_path // empty')
rel=${file#"$CLAUDE_PROJECT_DIR"/}
case "$rel" in
  tests/fixtures/claude/*)
    echo "tests/fixtures/claude/ is generated. Fix tests/fixtures/generate.ts (record shapes are in builder.ts) and regenerate with bun tests/fixtures/generate.ts." >&2
    exit 2 ;;
  bun.lock)
    echo "Don't edit bun.lock directly. Update it with bun add / bun remove / bun install." >&2
    exit 2 ;;
esac
exit 0
