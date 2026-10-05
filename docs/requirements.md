# Kairos Requirements

Last updated: 2026-10-05

> **Kairos**: Greek for "the meaningful moment". In contrast to *chronos*, the quantitative time a clock ticks off, *kairos* refers to "the time when something happened". The name reflects the intent of an app that gives the times on a calendar a meaning: what you did then.

Related: [Architecture](architecture.md) / [Tasks](tasks.md)

## 1. Background

Build a personal web app that lets you look back, on a calendar, on what you were doing on a given day and during a given time slot, based on Claude Code session history (`~/.claude/projects/**/*.jsonl`).


### 1.1 What we carry over

- Parse jsonl read-only. Keep the file offset, read only the new part, and deduplicate by `uuid`
- Split work blocks when activity pauses for a while (15 minutes by default)
- Live updates via file watching
- Pick up `git commit` / PR links in the logs as outcomes
- Local-only security (listen only on `127.0.0.1`, validate the Host header, block external resources with CSP)
- Two changes we verified while modifying it
  - Don't draw turns with `turnOrigin: "scheduled"` (automatic runs from `/loop` and cron)
  - Generate summaries with `claude -p --model haiku --no-session-persistence` (no API key needed, and running the summary isn't itself recorded in session history)

### 1.2 Problems we want to solve

| Problem | Details |
|---|---|
| Too many features | Cost, cache rate, effort, compaction, tool stats, status checks, etc. crowd the toolbar and detail panel, burying "what you did" |
| Readability | Blocks are narrow in the week view and titles are barely readable |
| Design | Looks dated. The UI is English only |
| No persistence | Logs are deleted automatically after about 30 days, so anything older can't be viewed |
| Slow startup | Re-reads all logs (about 895MB) on every start, taking about 8 seconds |
| Waiting for summaries | Summaries are generated after clicking, so every time you wait about 20 seconds |

## 2. Goals and scope

**Goal**: See at a glance what you were doing on a given day and at a given time.

**Out of scope**

- Cost and token analysis
- Team sharing, public access
- Operating on sessions (resume, etc.)
- Syncing across machines, distribution

## 3. Functional requirements

### 3.1 MVP

| # | Feature | Details |
|---|---|---|
| F1 | Ingest | Read jsonl incrementally and store it in SQLite. Data stays in the DB even after the original logs are deleted. The first run ingests everything |
| F2 | Exclusion | Exclude automatic-run turns, headless sessions with no human prompt, and specified projects |
| F3 | Calendar | Week and day views. The same period can also be shown as a per-day list. Work blocks (sections) are colored by project, and each block shows the headline of that section's AI summary (or the first line of the first prompt if none has been generated yet) |
| F4 | Detail drawer | Clicking a block opens it from the right. From top to bottom: the selected section's summary, the session flow (headlines of all sections), the outcomes of that time (commits and PRs), the conversation (collapsed at first; when opened, shown chat-style from the selected time, with tool calls collapsed), and numbers (usage and activity; collapsed, with only the key points on one line). `j` / `k` move to the previous/next work block in time order |
| F5 | AI summaries | **Per section (calendar block)**: finished sections are summarized automatically in the background and stored in the DB. The format is "headline, goal, what was done, result". Summaries can also be generated or regenerated manually. The output language is set on the server (`--summary-lang <en\|ja>`, default English) |
| F6 | Auto start | Started from Claude Code's SessionStart hook. Does nothing if already running. Fixed port |
| F7 | Live updates | Reflect in-progress sessions in real time |
| F8 | Search | Search all periods by summary, prompts and replies, PR and commit titles, and branch. Typing also narrows the shown period; a result jumps to its day and opens it (added 2026-10-05) |
| F9 | Report | Copy the shown period's work (after filters) as Markdown, grouped by day and project with PR links, for a stand-up note or a weekly report (added 2026-10-05) |
| F10 | Resume | Copy `cd <dir> && claude --resume <id>` from the drawer. Kairos itself never runs it (added 2026-10-05) |

### 3.2 Deferred

- Monthly heat map
- Support for logs from other tools such as Codex
- Notes and tags on blocks

## 4. Non-functional requirements

| Item | Requirement |
|---|---|
| Startup speed | Show the screen within 1 second by rendering from the DB. Ingest proceeds in the background |
| Log format changes | Give the parser a version; bumping it allows rebuilding the DB |
| Privacy | The only thing sent externally is the excerpt passed to `claude -p` for summaries. Never write to `~/.claude` |
| UI | Keep the screen to "calendar + drawer". The toolbar is limited to view switching, date navigation (previous/next, today, date picker), search (keyword), copying the period as a report and filters (projects, with outcomes, hide quick questions); theme, language and the keyboard shortcut list are tucked into the "⋯" menu. English UI by default with Japanese available; light and dark themes (follows the OS by default) |
| Operation | Used on one personal Mac |

## 5. Tech stack

| Layer | Choice |
|---|---|
| Runtime | Bun |
| API server | Hono |
| DB | SQLite (`bun:sqlite`) |
| Frontend | React + Vite |
| Styling | Tailwind CSS + shadcn/ui |
| Calendar rendering | Custom (CSS Grid). No library, so we can polish the look |
| Live updates | File watching + Server-Sent Events |
| Summaries | Run the `claude` CLI as a subprocess |

Everything is TypeScript, and the API types are shared between the frontend and the server.

## 6. Data model (draft)

```
projects      (id, path, name, repo, color, hidden)
sessions      (id, project_id, launch_cwd, label, branch,
               custom_title, agent_name, ai_title, first_prompt, away_summary, continued_in,
               started_at, ended_at, prompt_count, scheduled_runs)
subagents     (id, session_id, agent_type, description, tool_use_id)
messages      (session_id + id=uuid, agent_id, file_id, seq, ts, kind, text, tool_name, tool_use_id,
               is_error, is_scheduled, is_copy, meta)
artifacts     (session_id + kind=commit|pr + ref, title, ts, file_id, is_copy)
segments      (session_id, start, end)        -- can be recomputed from messages
summaries     (session_id, headline, body, model, covered_until, created_at)
ingest_state  (path, session_id, agent_id, offset, size, ino, parser_version, state)
```

Implemented in [src/server/db/index.ts](../src/server/db/index.ts). A continued session starts with a copy of the previous session's conversation under the same uuids, so message uniqueness is per session, and copies are flagged with `is_copy` and excluded from aggregates.

### 6.1 What we store

Keeping the raw jsonl in full would grow by gigabytes, so we follow this policy (provisional).

- Keep: user prompts, Claude's replies, tool names and a summary of their input, commits and PRs, summaries
- Truncate: tool output, up to the first few KB
- Don't keep: thinking, attached images

## 7. Decisions (provisional proposals adopted)

| # | Question | Decision |
|---|---|---|
| 1 | When to generate summaries automatically | Per section. Summarize sections 30 minutes after their last activity (immediately if a later section follows). For short sections (under 10 minutes and at most one prompt), don't write a body; generate only a headline with the LLM. Don't summarize whole sessions (changed on 2026-10-05) |
| 2 | Summary range on first ingest | Generate automatically for the last 7 days. Older ones are generated when the drawer is opened |
| 3 | Gap that splits work blocks | 15 minutes. Make it configurable |
| 4 | Treating projects as the same | Group `<repo>/.claude/worktrees/<name>` with the parent repository as one project, keeping the worktree name as a secondary label. If there is a git remote (origin), name the project after the repository and merge other clones of the same remote into one (if the directory name differs from the repository name, keep it as a secondary label). The remote is found by reading `.git/config` only; no git commands are run |
