# Kairos

A personal web app that ingests Claude Code session logs (`~/.claude/projects/**/*.jsonl`) into SQLite and lets you look back on them in a calendar. Assumes macOS and Bun.

Design: [Architecture](ARCHITECTURE.md) / [Design](DESIGN.md)

## Commands

```sh
bun run check      # Biome + type check + JSDoc check + tests. Always run it at the end of a change
bun run format     # auto-fix with Biome
bun test tests/server/ingest/ingester.test.ts   # a single test file
bun run dev        # API :4319 + Vite :5173. Run `kairos stop` first (same port)
bun tests/fixtures/generate.ts                  # regenerate the fixtures
bun run screenshots   # retake docs/images/screen-*.png from a fictional week (after `bun run build`)
bun run visual        # visual regression: every view × light/dark × en/ja × 1440/1024 against .visual/baseline
bun run e2e           # behaviour tests in headless Chrome (tests/e2e) and the axe accessibility ratchet
```

Finished work goes to main without a PR: when asked to merge, use `/land` (review → fix → fast-forward merge; push only on request). To deploy to the locally running server, use `/ship-local` (check → build → `kairos restart`). To check a UI change in the browser against the fixtures, use `/verify-ui`.

## Layout

- `src/cli/` — the `kairos` command (`ensure` / `open` / `serve` / `ingest` / `summarize` / `report`, etc.). `index.ts` is only the entry point (parse → typed `CliContext` from `args.ts` → command → exit code); commands live in `commands/` and throw `CliError` / `UsageError` (`errors.ts`) rather than exiting. A new flag is defined once in `options.ts` (type, default, help, whether it goes to the server) and listed by name under each command in `help.ts`; the CLI refuses any a command doesn't list. `views.ts` renders `report` / `open-items` / `search`, `doctor.ts` the checks, `style.ts` the colors they share, `daemon.ts` handles background start and the PID file (which also keeps the server's options for `restart`)
- `src/server/ingest/` — find files (`files`) → incremental read (`reader`, resume state in `fileState`) → classify (`classify`) → store (`ingester`, a façade) → derived data (`derived`: aggregates and work blocks from `segments`) and project assignment (`placement`). `watcher` re-ingests changed files while the server runs
- `src/server/db/` — schema and `MIGRATIONS`; `kv.ts` reads and writes the kv table (settings, the derived version)
- `src/server/queries/` — read queries behind the API. `index.ts` is the `Queries` façade that only delegates; the domain modules (usage, titles, activity, sessions, messages, projects, search, ...) hold the logic, and other features import helpers from them
- `src/server/` (top level) — `settings.ts` (settings in the DB's kv table), `events.ts` (SSE broadcast), `pricing.ts` (token → USD, a usage gauge rather than the real bill), `serve.ts` (server startup)
- `src/server/summarize/` — per-section summaries. Runs `claude -p` with side-effect-free settings. The output language follows the UI language (stored on the server via `PATCH /api/settings`); `--summary-lang <en|ja>` fixes it instead. Existing summaries are kept and can be regenerated from the drawer
- `src/server/api/` — Hono. `app.ts` registers the routes, `validate.ts` checks request input, `security.ts` holds Host validation, CSP and write protection
- `src/shared/` — API types, constants, and rules the server, CLI and UI must agree on (dates, PR refs, open items, close notes, summary failures, the UI's URL parameters). Put a rule here once a second layer needs it
- `src/web/` — React 19 + Tailwind v4 + shadcn/ui (`@/` is `src/web/src`)
- `src/web/src/i18n/` — UI language (English by default, Japanese selectable from the "⋯" menu, saved per browser). Messages live in `messages/*.ts` via `defineMessages`
- `tests/` mirrors `src/` (`cli/`, `server/`, `web/`). `tests/web` covers pure `lib/` logic without a DOM and imports by relative path (the `@/` alias is not used in tests); call `setLocale` when a test checks copy. `tests/e2e/` (`*.e2e.ts`, left out of `bun test`) drives the built UI by role and name with `bun run e2e`

## Data

- DB and PID file: `~/Library/Application Support/kairos/` (`kairos.db`, `kairos.pid`); server log: `~/Library/Logs/kairos/server.log`. Inspect the DB with `sqlite3 -readonly`
- `KAIROS_DATA_DIR` moves all of these. Always set it when starting an extra server (previews, experiments); otherwise it overwrites the real PID file and `kairos stop` / `restart` lose track of the running daemon. A hook (`.claude/hooks/guard-bash.sh`) blocks starting a server without it while the daemon runs, and any `sqlite3` on the real DB without `-readonly`

## Rules

- **Original logs are read-only.** Never write under `~/.claude/projects` (a hook blocks edits to `*.jsonl`)
- Area-specific rules live in `.claude/rules/` and load when you touch those files: `code-structure.md` (all of `src/`), `ingest.md` (fixtures, `PARSER_VERSION` / `DERIVED_VERSION`), `db.md` (`MIGRATIONS` is append-only), `api.md` (`guardHost` / `guardWrite`, `claude -p` flags), `web.md` (i18n, Markdown rendering). Skills for recurring changes: `/add-migration`, `/add-fixture-scenario`, `/add-api-route`, `/add-model-price`
- A Stop hook (`.claude/hooks/rules-check.sh`) runs `bun run check` when code is uncommitted, flags a missing version bump or a rewritten migration, and asks for `security-reviewer` / `i18n-reviewer` / `design-reviewer` / `query-plan-reviewer` (and `bun run eval:summary` for the summary prompt) when their areas change (once per distinct diff). `/land` also runs `structure-reviewer` against `.claude/rules/code-structure.md`
- **Don't loosen API security** (Host validation, write protection, `127.0.0.1` only, no raw HTML or images from conversation Markdown). When you change any of it, check with the `security-reviewer` agent

## Writing

- Comments, docs, test names and commit messages are in English. Comments explain *why*
- **Every export has a JSDoc** (functions, components, hooks, types, constants, and public members of exported classes). `bun run jsdoc` (`scripts/check-jsdoc.ts`, part of `check`) fails on a missing one. Say what it is and why it exists, not the signature again
- If a step inside a function needs a comment to explain *what* it does, the function is likely doing too much: extract that step into a named, documented function instead. Inline comments are for *why* (a constraint, a log-format quirk, a trade-off). The full structure rules (single responsibility, signals to split, where logic lives per layer, how to refactor) are in `.claude/rules/code-structure.md`
- UI copy is never hard-coded; it goes in the `en` / `ja` dictionaries (see `.claude/rules/web.md`)
- Server and CLI output is in English
- Follow the Biome config (double quotes, semicolons, 100-column lines). Edited files are auto-formatted by a hook
- Imports include the extension (`./foo.ts`)
- Don't leave Promises floating (`noFloatingPromises`). Prefix with `void` when you intentionally don't await
- Check the latest docs for new library APIs with the context7 MCP (many dependencies are new major versions: Vite 8, TS 7, Tailwind v4, etc.)
