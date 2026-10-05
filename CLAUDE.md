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

To deploy to the locally running server, use `/ship-local` (check → build → `kairos restart`).

## Layout

- `src/cli/` — the `kairos` command (`ensure` / `open` / `serve` / `ingest`, etc.). `daemon.ts` handles background start and the PID file
- `src/server/ingest/` — incremental read (`reader`) → classify (`classify`) → store (`ingester`) → work blocks (`segments`)
- `src/server/summarize/` — per-section summaries. Runs `claude -p` with side-effect-free settings. The output language is set with `--summary-lang <en|ja>` (default `en`); existing summaries are kept and can be regenerated from the drawer
- `src/server/api/` — Hono. `security.ts` holds Host validation, CSP and write protection
- `src/shared/` — API types and constants shared by the server and the UI
- `src/web/` — React 19 + Tailwind v4 + shadcn/ui (`@/` is `src/web/src`)
- `src/web/src/i18n/` — UI language (English by default, Japanese selectable from the "⋯" menu, saved per browser). Messages live in `messages/*.ts` via `defineMessages`

## Rules

- **Original logs are read-only.** Never write under `~/.claude`. Tests copy the fixtures into a temporary directory (`tests/server/ingest/helpers.ts`)
- **`tests/fixtures/claude/` is generated.** Fix `tests/fixtures/generate.ts` / `builder.ts` and regenerate. `tests/fixtures/README.md` is the source of truth for scenario expectations; when changing interpretation rules, add the scenario and tests first (`/add-fixture-scenario`)
- **Fixtures contain fictional data only.** Never copy text, paths, PRs, etc. from real logs. Conversation text in fixtures may be in any language
- When interpretation rules change, bump `PARSER_VERSION`; when only the computation of aggregates, work blocks or project assignment changes, bump `DERIVED_VERSION` (`src/server/ingest/ingester.ts`)
- **Add DB schema changes to the end of `MIGRATIONS` in `src/server/db/index.ts`.** Never rewrite existing entries
- **Don't loosen API security**: new routes must go through `guardHost`, and write routes through `guardWrite`. Listen on `127.0.0.1` only. Don't render raw HTML or images from conversation Markdown. When you change any of this, check with the `security-reviewer` agent
- If you suspect Claude Code's log format has changed, use the `log-format-auditor` agent to compare real logs against the rules

## Writing

- Comments, docs, test names and commit messages are in English. Comments explain *why*
- UI copy is never hard-coded in components. Add it to the dictionaries in `src/web/src/i18n/messages/*.ts` with `defineMessages`, in both `en` and `ja`. English is the source of truth and Japanese must have the same shape (a missing key is a type error). Call the message function at render time, not at module level
- Server and CLI output is in English
- Follow the Biome config (double quotes, semicolons, 100-column lines). Edited files are auto-formatted by a hook
- Imports include the extension (`./foo.ts`)
- Don't leave Promises floating (`noFloatingPromises`). Prefix with `void` when you intentionally don't await
- Check the latest docs for new library APIs with the context7 MCP (many dependencies are new major versions: Vite 8, TS 7, Tailwind v4, etc.)
