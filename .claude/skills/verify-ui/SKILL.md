---
name: verify-ui
description: Starts Kairos against the test fixtures and checks a UI change in Chrome across languages, themes and views, with screenshots.
disable-model-invocation: true
---

# Check a UI change in the browser

Uses the fixtures instead of the real logs, so the data is fictional and the same every time, and the everyday DB is untouched.

## Start

1. The dev server and the background `kairos` both use port 4319. Check `kairos status`; if it's running, ask before running `kairos stop` (and start it again at the end with `kairos ensure`)
2. Start the API against the fixtures with a throwaway data dir (in the background):
   `KAIROS_DATA_DIR=<scratchpad>/kairos-data bun src/cli/index.ts serve --claude-dir tests/fixtures/claude --no-auto-summary`
   (`--no-auto-summary` keeps it from running `claude -p` over every fixture session)
3. Start Vite (in the background): `bunx vite`, then wait until `http://localhost:5173` responds
4. Load the claude-in-chrome tools (one ToolSearch), check the tab context, and open a new tab at `http://localhost:5173`

## Check

The fixtures start at 2026-09-28 (UTC). Go there with the date picker (or ← / →) first; "today" will usually be empty.

Look at the screen the change touches, in each combination that matters:

- **Language**: English and Japanese (the "⋯" menu or `?` → Language). Look for overflow, truncation and leftover English
- **Theme**: light and dark (same menu)
- **View**: week / day (`w` / `d`), calendar / list (`c` / `l`), and the session drawer (click a block, `j` / `k` to step)
- **Width**: if layout changed, also around 1024px with `resize_window`

Take a screenshot of each state you check. Also read the console (`read_console_messages`, pattern `error|warn`) and note any React warnings.

## Finish

- Stop the two background processes and close the tab you opened
- Start `kairos` again with `kairos ensure` if you stopped it
- Report: what you checked, the screenshots, anything that looked wrong (with the state that reproduces it), and console errors
