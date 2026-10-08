#!/bin/bash
# Stop: enforce the CLAUDE.md rules Claude might otherwise skip — run `bun run check` on
# uncommitted code, catch what check can't see (a missing PARSER_VERSION / DERIVED_VERSION bump,
# rewrites of existing MIGRATIONS entries) and ask for the reviewer agents the rules require.
# It may misfire on pure refactors, so it fires once per stop (stop_hook_active) and Claude can explain.
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

# Reviewer reminders fire once per distinct diff of their paths, not on every stop: the hash of
# the last diff we reminded about is kept under .git so a reviewed, unchanged diff stays quiet.
reminded_dir="$(git rev-parse --git-dir)/claude-reminders"
remind_once() {
  local agent=$1 message=$2; shift 2
  changed "$@" || return 0
  local untracked fingerprint
  untracked=$(git ls-files --others --exclude-standard -- "$@")
  fingerprint=$( { git diff "$base" -- "$@"; [ -n "$untracked" ] && cat $untracked; } | shasum | cut -d' ' -f1)
  [ "$(cat "$reminded_dir/$agent" 2>/dev/null)" = "$fingerprint" ] && return 0
  mkdir -p "$reminded_dir" && echo "$fingerprint" >"$reminded_dir/$agent"
  issues+=("$message")
}

remind_once security-reviewer \
  "API security, summary execution or Markdown rendering changed. Run the security-reviewer agent." \
  src/server/api src/server/summarize/claude.ts src/shared/constants.ts \
  src/web/src/components/Markdown.tsx
remind_once i18n-reviewer \
  "UI components or message dictionaries changed. Run the i18n-reviewer agent." \
  'src/web/src/*.tsx' src/web/src/i18n
remind_once design-reviewer \
  "Components, styles or DESIGN.md changed. Run the design-reviewer agent." \
  src/web/src/components src/web/src/index.css DESIGN.md

# CLAUDE.md asks for `bun run check` at the end of every change. It takes a few seconds, so run it
# whenever code is uncommitted rather than trusting that it was run.
if [ -n "$(git status --porcelain -- src tests scripts package.json biome.json 'tsconfig*.json')" ]; then
  if ! output=$(bun run check 2>&1); then
    issues+=("bun run check failed. Fix it before finishing:"$'\n'"$(tail -n 40 <<<"$output")")
  fi
fi

[ ${#issues[@]} -eq 0 ] && exit 0
reason=$(printf -- "- %s\n" "${issues[@]}")
reason+=$'\nFix these, or tell the user why they do not apply (e.g. a pure refactor with identical output).'
jq -n --arg r "$reason" '{decision: "block", reason: $r}'
exit 0
