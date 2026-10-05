# Kairos

A personal web app that ingests Claude Code session logs (`~/.claude/projects/**/*.jsonl`) into SQLite and lets you look back on them in a calendar. Assumes macOS and Bun.

Design: [Requirements](docs/requirements.md) / [Architecture](docs/architecture.md) / [Design](docs/design.md) / [Tasks](docs/tasks.md)

## Commands

```sh
bun run check      # Biome + type check + tests. Always run it at the end of a change
bun run format     # auto-fix with Biome
bun test tests/server/ingest/ingester.test.ts   # a single test file
bun run dev        # API :4319 + Vite :5173. Run `kairos stop` first (same port)
bun tests/fixtures/generate.ts                  # regenerate the fixtures
```

To deploy to the locally running server, use `/ship-local` (check → build → `kairos restart`). To check a UI change in the browser against the fixtures, use `/verify-ui`.

## Layout

- `src/cli/` — the `kairos` command (`ensure` / `open` / `serve` / `ingest`, etc.). `daemon.ts` handles background start and the PID file
- `src/server/ingest/` — incremental read (`reader`) → classify (`classify`) → store (`ingester`) → work blocks (`segments`)
- `src/server/summarize/` — per-section summaries. Runs `claude -p` with side-effect-free settings. The output language is set with `--summary-lang <en|ja>` (default `en`); existing summaries are kept and can be regenerated from the drawer
- `src/server/api/` — Hono. `security.ts` holds Host validation, CSP and write protection
- `src/shared/` — API types and constants shared by the server and the UI
- `src/web/` — React 19 + Tailwind v4 + shadcn/ui (`@/` is `src/web/src`)
- `src/web/src/i18n/` — UI language (English by default, Japanese selectable from the "⋯" menu, saved per browser). Messages live in `messages/*.ts` via `defineMessages`

## Rules

- **Original logs are read-only.** Never write under `~/.claude/projects` (a hook blocks edits to `*.jsonl`)
- Area-specific rules live in `.claude/rules/` and load when you touch those files: `ingest.md` (fixtures, `PARSER_VERSION` / `DERIVED_VERSION`), `db.md` (`MIGRATIONS` is append-only), `api.md` (`guardHost` / `guardWrite`, `claude -p` flags), `web.md` (i18n, Markdown rendering)
- A Stop hook (`.claude/hooks/rules-check.sh`) flags a missing version bump or a rewritten migration
- **Don't loosen API security** (Host validation, write protection, `127.0.0.1` only, no raw HTML or images from conversation Markdown). When you change any of it, check with the `security-reviewer` agent

## Writing

- Comments, docs, test names and commit messages are in English. Comments explain *why*
- UI copy is never hard-coded; it goes in the `en` / `ja` dictionaries (see `.claude/rules/web.md`)
- Server and CLI output is in English
- Follow the Biome config (double quotes, semicolons, 100-column lines). Edited files are auto-formatted by a hook
- Imports include the extension (`./foo.ts`)
- Don't leave Promises floating (`noFloatingPromises`). Prefix with `void` when you intentionally don't await
- Check the latest docs for new library APIs with the context7 MCP (many dependencies are new major versions: Vite 8, TS 7, Tailwind v4, etc.)
