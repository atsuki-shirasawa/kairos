# <img src="src/web/public/favicon.svg" width="32" alt=""> Kairos

A personal web app that turns your Claude Code session history into a calendar, so you can look back on what you were doing on a given day and at a given time.

> **Kairos** is Greek for "the meaningful moment". Where *chronos* is the time a clock ticks off, *kairos* is the time when something happened — the app gives the hours on a calendar their meaning: what you did then.

- Ingests the logs (`~/.claude/projects/**/*.jsonl`) read-only and stores them in SQLite. Even after Claude Code deletes its logs (30 days by default), Kairos keeps them
- Shows a month, a week or a day: the month lists each day's work, the week and day place it at its time
- Automatically summarizes each work block (section) with `claude -p` (haiku)
- Searches every period by summaries, prompts and replies, PR and commit titles, and branches; `file:<path>` finds the work that edited a file
- A summary view with working time, PRs, commits, tokens and estimated cost against the previous period, and per-project recaps written on request
- Copies the shown period as a Markdown report (by day and project, with PR links) for a stand-up or a weekly report, and copies `claude --resume` for any session
- Starts in the background whenever you launch Claude Code
- The UI is in English by default; Japanese can be selected from the "⋯" menu (saved per browser)

![Kairos week view with the detail drawer](docs/images/screen-week.png)

Design docs: [Architecture](ARCHITECTURE.md) / [Design](DESIGN.md)

## Goals

**See at a glance what you were doing on a given day and at a given time.** That shapes the rest:

- What you did comes first; numbers (tokens, cost, snags) stay in the background
- Blocks are readable even in the week view, and each one is named by its summary
- History outlives Claude Code's log retention (about 30 days), because it lives in Kairos's own DB
- The screen appears right away: it renders from the DB, and ingest reads only what was appended
- Summaries are written in the background, so they are already there when you open a block

**Not in scope:** detailed cost and token analysis (only period totals and estimates are shown), team sharing or public access, acting on sessions (Kairos copies the resume command but never runs it), and syncing across machines. It is built for one personal Mac.

Ideas for later: a monthly heat map, logs from other tools such as Codex, notes and tags on blocks.

## Setup

Requirements: macOS, [Bun](https://bun.sh) 1.3 or later, Claude Code (logged in; used for summaries)

```sh
git clone <this repo> ~/dev/kairos && cd ~/dev/kairos
bun install
bun run build      # build the web UI (dist/web)
bun link           # put the kairos command in ~/.bun/bin
kairos open        # start and open in the browser (the first ingest takes a few seconds)
```

### Start automatically with Claude Code

Add the following to `hooks.SessionStart` in `~/.claude/settings.json`.

```json
{
  "type": "command",
  "command": "'/Users/<you>/.bun/bin/kairos' ensure 2>/dev/null || true",
  "timeout": 5
}
```

`kairos ensure` does nothing if the server is already running (about 20ms); otherwise it starts the server in the background and returns immediately. It prints nothing, so it doesn't affect the Claude conversation. The server keeps running after Claude Code exits. It doesn't open a browser — run `kairos open` or open http://127.0.0.1:4319 when you want to look.

## Usage

| Command | What it does |
|---|---|
| `kairos open` | Start the server and open it in the browser |
| `kairos status` | Whether it's running, the PID, and where the log is |
| `kairos stop` / `kairos restart` | Stop / stop and start again (after updating Kairos) |
| `kairos ingest` | Ingest logs manually (to build the DB without running the server) |
| `kairos summarize` | Summarize every work block that has no summary yet. The server only does the last 7 days on its own. `--since` / `--until <YYYY-MM-DD>` and `--limit <n>` narrow it; `--dry-run` only counts |
| `kairos help [command]` | List the commands, or one command's options (also `kairos <command> --help`) |

Options: `--summary-model <model>` (default: haiku), `--summary-effort <low|medium|high|xhigh|max>` (how hard the model thinks; default: low), `--summary-lang <en|ja>` (language of the summaries; by default they follow the language chosen in the UI, English until one is chosen), `--no-auto-summary` (don't summarize automatically; only when requested with the button in the UI), `--port <n>` (default: 4319), `--claude-dir <path>` (Claude Code config directory; default: `~/.claude`), `--db <path>` (DB file; default: under the data directory)

Changing the language (in the UI or with `--summary-lang`) doesn't rewrite existing summaries. They stay as they are, and you can regenerate any of them from the drawer.

Keyboard shortcuts: `←` `→` previous/next period, `t` today, `m` month view, `w` week view, `d` day view, `c` calendar, `s` summary (totals, time by day and project, what was done, and recaps), `l` the summary as a table (one row per block with sortable numbers), `j` `k` next/previous work block, `/` search (the shown period, plus every period in the list under the field; `↓` to pick), `Esc` close details, `?` menu with theme, language and shortcuts

### Updating

```sh
git pull && bun install && bun run build && kairos restart
```

## Where data lives

| Kind | Location |
|---|---|
| DB | `~/Library/Application Support/kairos/kairos.db` |
| PID | `~/Library/Application Support/kairos/kairos.pid` |
| Log | `~/Library/Logs/kairos/server.log` |
| Working directory for summaries | `~/Library/Application Support/kairos/summarizer/` (stays empty) |

Set `KAIROS_DATA_DIR` to put the DB, PID and log somewhere else together (e.g. to try things out against a separate DB).

### About Claude Code's log retention

Kairos keeps what it ingested in its DB, so the calendar, summaries and conversations don't disappear even if you don't extend Claude Code's `cleanupPeriodDays`. However, sessions whose original logs are gone can't be re-read when Kairos updates its interpretation rules (`PARSER_VERSION`). If that matters to you, extend `cleanupPeriodDays` as well.

### Uninstalling

```sh
kairos stop
bun unlink                       # remove the kairos command (run in the repository)
rm -rf ~/Library/Application\ Support/kairos ~/Library/Logs/kairos
```

Then remove the `kairos ensure` entry from SessionStart in `~/.claude/settings.json`.

## Troubleshooting

Start with `kairos status` (is it running, which PID) and the log at `~/Library/Logs/kairos/server.log`.

| Symptom | What to do |
|---|---|
| Nothing at http://127.0.0.1:4319 | Run `kairos open`. If it still doesn't answer, check the log: `cannot listen on 127.0.0.1:4319` means another process holds the port (often `bun run dev`) |
| The page is empty or 404, but the API answers | The web UI isn't built (the log says so). Run `bun run build`, then `kairos restart` |
| It doesn't start when Claude Code launches | Check that the SessionStart hook uses the absolute path to `kairos` (`which kairos`); hooks don't see your shell's `PATH` |
| Summaries say "Couldn't summarize" | The drawer tells you why. Usually `claude` isn't logged in (run `claude` in a terminal and log in) or isn't installed (install it, then `kairos restart`). Press the button in the drawer to try again |
| Recent work is missing or looks stale | Ingest runs on file changes; `kairos restart` re-reads anything changed since the last run |
| The DB looks broken, or you want to start over | `kairos stop`, delete `~/Library/Application Support/kairos/kairos.db*`, then `kairos open`. Everything is ingested again, but **sessions whose original logs Claude Code already deleted are gone for good**, and only the last 7 days are re-summarized automatically (run `kairos summarize` for the rest) |
| `bun run dev` fails to start the API | The background server holds the same port. Run `kairos stop` first |

## Development

```sh
bun run dev      # start the API (:4319) and Vite (:5173) together. The UI is at http://127.0.0.1:5173
bun run check    # Biome (lint and format) + type check + tests
bun run format   # auto-fix with Biome
```

`bun run dev` uses the same port as the background server, so run `kairos stop` first.

`bun run screenshots` retakes the screenshots in `docs/images/` from a fictional week (needs `bun run build` and Google Chrome).

The fictional test logs can be regenerated with `bun tests/fixtures/generate.ts` ([details](tests/fixtures/README.md)).

## License

[MIT](LICENSE)
