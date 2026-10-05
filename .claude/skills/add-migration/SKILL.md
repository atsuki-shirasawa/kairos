---
name: add-migration
description: Appends a DB schema change to MIGRATIONS in src/server/db/index.ts, with tests, and decides whether ingest versions need bumping. Use when adding tables, columns or indexes.
---

# Add a DB migration

`openDb` applies `MIGRATIONS[user_version..]` in order, one transaction each, and sets `PRAGMA user_version` to the index + 1. Everyone's DB at `~/Library/Application Support/kairos/kairos.db` has already run the existing entries, so **editing one does nothing on their machine and silently diverges from a fresh DB**. The Stop hook (`.claude/hooks/rules-check.sh`) flags it if it happens.

## Steps

1. **Read the current schema**: All of `MIGRATIONS` in `src/server/db/index.ts` (later entries alter earlier tables). To see the real DB: `sqlite3 -readonly ~/Library/Application\ Support/kairos/kairos.db .schema`
2. **Append one entry** at the end of the array, as a template string like the others
   - Write a SQL comment for *why* the table/column exists and where its data comes from (record type, field), in the style of the existing entries
   - SQLite limits: `ALTER TABLE ... ADD COLUMN` can't add `NOT NULL` without a `DEFAULT`, and can't add `PRIMARY KEY` / `UNIQUE`. To change a column, create a new table, copy, drop and rename within the same entry
   - Child tables of `sessions` use `REFERENCES sessions(id) ON DELETE CASCADE` (and `ingest_state(id)` when rows belong to a file), so a re-read cleans them up
   - Add the index for the query you're about to write (most reads are by `session_id` and time)
3. **Fill the data**: Decide how existing rows get values
   - Comes from the jsonl → write it in `src/server/ingest/` and bump `PARSER_VERSION` (files whose logs still exist are re-read; sessions whose logs are gone keep the default)
   - Computable from what's already in the DB → do it in the derived recomputation and bump `DERIVED_VERSION`
   - New data only → no bump, but say so in the report
4. **Types and API**: Update row types / queries on the server, and `src/shared/` if the API response changes
5. **Tests**
   - The migration applies to a fresh DB: `openDb(":memory:")` and check the new table/column (`PRAGMA table_info(...)`) and that `PRAGMA user_version` equals `SCHEMA_VERSION`
   - An upgrade from the previous version: create a DB at `SCHEMA_VERSION - 1` (apply the old entries), add a row, then open it and check the row survived with the expected default
   - If ingest fills the column, assert it in `tests/server/ingest/ingester.test.ts` against a fixture scenario (`/add-fixture-scenario` if no scenario covers it)
6. **Verify**: `bun run check`

## Report when done

- The SQL added and the new `SCHEMA_VERSION`
- How existing data is filled (the version bumped, or "new data only")
- That deploying with `/ship-local` migrates the everyday DB on start, and it can't be rolled back without restoring the file
