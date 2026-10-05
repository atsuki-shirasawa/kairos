#!/bin/bash
# Stop: catch CLAUDE.md rules that `bun run check` can't see — a missing PARSER_VERSION /
# DERIVED_VERSION bump, and rewrites of existing MIGRATIONS entries. It only reminds; it may
# misfire on pure refactors, so it fires once per stop (stop_hook_active) and Claude can explain.
input=$(cat)
[ "$(jq -r '.stop_hook_active // false' <<<"$input")" = "true" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
git rev-parse --verify -q main >/dev/null || exit 0

# Committed changes on this branch plus uncommitted ones. On main itself this is only the working tree.
base=$(git merge-base HEAD main)
changed() { ! git diff --quiet "$base" -- "$@"; }
bumped() { git diff "$base" -- src/server/ingest/ingester.ts | grep -qE "^\+export const $1 ="; }

issues=()

parser_files=(src/server/ingest/{classify,records,reader,commits,prs}.ts)
if changed "${parser_files[@]}" && ! bumped PARSER_VERSION; then
  issues+=("Interpretation code changed (classify/records/reader/commits/prs) but PARSER_VERSION was not bumped.")
fi

derived_files=(src/server/ingest/{segments,project}.ts)
if changed "${derived_files[@]}" && ! bumped DERIVED_VERSION; then
  issues+=("Work-block / project-assignment code changed (segments/project) but DERIVED_VERSION was not bumped.")
fi

# Existing MIGRATIONS entries must never change: any removed or modified line between
# `const MIGRATIONS` and `SCHEMA_VERSION` in the base version is a rewrite. Appending is a pure insert.
db=src/server/db/index.ts
if changed "$db"; then
  start=$(git show "$base:$db" 2>/dev/null | grep -n "^const MIGRATIONS" | cut -d: -f1)
  end=$(git show "$base:$db" 2>/dev/null | grep -n "^export const SCHEMA_VERSION" | cut -d: -f1)
  if [ -n "$start" ] && [ -n "$end" ]; then
    # Hunk headers look like "@@ -old_start,old_count +new_start,new_count @@"; old_count defaults to 1
    rewritten=$(git diff -U0 "$base" -- "$db" | awk -v s="$start" -v e="$end" '
      /^@@/ {
        split($2, a, ","); os = substr(a[1], 2) + 0; oc = (a[2] == "" ? 1 : a[2] + 0)
        if (oc > 0 && os < e - 1 && os + oc - 1 > s) { print "yes"; exit }
      }')
    [ -n "$rewritten" ] && issues+=("An existing MIGRATIONS entry in $db was modified. Revert it and append a new entry instead.")
  fi
fi

[ ${#issues[@]} -eq 0 ] && exit 0
reason=$(printf -- "- %s\n" "${issues[@]}")
reason+=$'\nFix these, or tell the user why they do not apply (e.g. a pure refactor with identical output).'
jq -n --arg r "$reason" '{decision: "block", reason: $r}'
exit 0
