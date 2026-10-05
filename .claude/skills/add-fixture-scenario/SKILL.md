---
name: add-fixture-scenario
description: Adds a scenario to the test fixtures, and updates the expectations table and tests, to handle a new Claude Code log format (an unknown record type, origin, system message, etc.). Use when changing or adding ingest interpretation rules.
---

# Add a fixture scenario

Kairos's ingest is accepted against "the expectations table in the fixture README". When changing interpretation rules, always add the scenario first, then fix the code.

## Steps

1. **Check the shape**: Find a few of the target records in real logs (`~/.claude/projects/**/*.jsonl`) and check which keys exist and what types the values have. Real logs are read-only. Don't copy text, paths, PR numbers, etc. into the fixtures as-is (make everything fictional)
2. **Extend the builder**: If a new record shape is needed, add a method to `LogBuilder` in `tests/fixtures/builder.ts`. Don't change the output of existing methods (it would break the expectations of existing scenarios)
3. **Add the scenario**
   - If it fits into an existing scenario, add it to that scenario's function (and reflect the changed expectations in the README)
   - If it stands alone, add an ID to `SID` in `tests/fixtures/ids.ts` (in the form `cccccccc-cccc-4ccc-8ccc-cccccccccccc`), write a function in `generate.ts` under a `// ---- N. Name` heading, and add it to the scenario array at the end
   - Times are minutes from the base time (2026-09-28 00:00 UTC). Pick a time range whose work blocks don't overlap existing scenarios
4. **Generate**: `bun tests/fixtures/generate.ts` (don't edit `tests/fixtures/claude/` directly; a hook also blocks it)
5. **Write the expectations**: Add a row to the scenario table in `tests/fixtures/README.md`. If it's a rule confirmed by the study, also add it to the "Rules" table with its evidence. Keep `ARCHITECTURE.md` §3.1 Normalization rules in sync
6. **Write the test**: Add `test("N. Name: what it checks")` to `describe` for the README scenarios in `tests/server/ingest/ingester.test.ts`. If it's only about classification, use `classify.test.ts`
7. **Implement**: Confirm the test fails, then fix `src/server/ingest/`
8. **Bump the version** (`src/server/ingest/ingester.ts`)
   - The interpretation of jsonl changes → `PARSER_VERSION`
   - Only aggregation from messages or work-block computation changes → `DERIVED_VERSION`
9. **Verify**: `bun run check` passes

## Report when done

- The scenario added and its expectations (the README row)
- The version bumped and what happens in the real environment (for `PARSER_VERSION`, files whose original logs remain are re-read)
