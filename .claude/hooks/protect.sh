#!/bin/bash
# PreToolUse: 生成物を直接編集させない。exit 2 で拒否し、stderr の理由を Claude に返す。
file=$(jq -r '.tool_input.file_path // empty')
rel=${file#"$CLAUDE_PROJECT_DIR"/}
case "$rel" in
  tests/fixtures/claude/*)
    echo "tests/fixtures/claude/ は生成物です。tests/fixtures/generate.ts（形は builder.ts）を直し、bun tests/fixtures/generate.ts で作り直してください。" >&2
    exit 2 ;;
  bun.lock)
    echo "bun.lock は直接編集しません。bun add / bun remove / bun install で更新してください。" >&2
    exit 2 ;;
esac
exit 0
