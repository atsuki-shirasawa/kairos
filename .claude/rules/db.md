---
paths:
  - "src/server/db/**"
---

# DB schema

- Add schema changes to the end of `MIGRATIONS` in `src/server/db/index.ts`. Never rewrite existing entries: everyday DBs have already applied them, so an edit only makes fresh and existing DBs diverge. The Stop hook flags rewrites
- Use `/add-migration` for the steps (SQLite `ALTER TABLE` limits, how to fill existing rows, upgrade tests)
- Queries use placeholders, never string-built SQL from API inputs
- To look at the real DB, open it read-only: `sqlite3 -readonly ~/Library/Application\ Support/kairos/kairos.db`
