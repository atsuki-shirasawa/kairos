---
paths:
  - "src/server/ingest/**"
  - "tests/fixtures/**"
  - "tests/server/ingest/**"
---

# Ingest and fixtures

## Interpretation rules

- The current rules are the table in `docs/architecture.md` §3.1, and the evidence and expectations per scenario are in `tests/fixtures/README.md` (the source of truth). Read them before changing how records are classified
- When changing interpretation rules, add the scenario and tests first, then the code: use `/add-fixture-scenario`
- If you suspect Claude Code's log format has changed, use the `log-format-auditor` agent to compare real logs against the rules

## Versions (`src/server/ingest/ingester.ts`)

- How jsonl is interpreted changes (`classify` / `records` / `reader` / `commits` / `prs`, or record handling in `ingester`) → bump `PARSER_VERSION`. Files whose original logs still exist are re-read
- Only aggregates, work blocks or project assignment change (`segments` / `project`, computed from the DB) → bump `DERIVED_VERSION`. All sessions are recomputed, even those whose logs are gone
- The Stop hook (`.claude/hooks/rules-check.sh`) reminds you if a bump looks missing

## Fixtures

- `tests/fixtures/claude/` is generated. Fix `tests/fixtures/generate.ts` / `builder.ts` and run `bun tests/fixtures/generate.ts` (a hook blocks direct edits)
- Don't change the output of existing `LogBuilder` methods; it breaks the expectations of existing scenarios
- Fictional data only. Never copy text, paths, PR numbers, etc. from real logs. Conversation text may be in any language
- Tests never read `~/.claude` directly: copy the fixtures into a temporary directory (`tests/server/ingest/helpers.ts`)
