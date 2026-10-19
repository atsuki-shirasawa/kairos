# Kairos screens

How each screen applies [DESIGN.md](../../DESIGN.md): its layout, sizes and states. The principles,
tokens and shared components are there; why a screen bends a rule is in
[decisions.md](decisions.md).

## Today (home)

The page the app opens on (`/today`, `h`, the mark and wordmark in the toolbar, which are its
button, or "Today" in the place toggle). It has no period, so the Journal's controls (period
navigation, search, the period dropdown, the layout toggle and filters) give way; the lit "Today"
segment names the page, so its heading is for screen readers only.

- **Two columns** from `lg` (one below), on `surface`, at most `max-w-7xl` and centered: Now on
  the left, Pick up then Last workday on the right (40px apart), so at 1440×900 the first card
  waiting on you and the first cards to pick up show without scrolling. Each section heading is
  17px semibold
- **Now:** today's tokens (the chart below), then the running sessions in groups, each under its
  name and count (14px medium, the count in `numeral`, `warn` for a non-empty On you): On you
  (asking or done with a turn) as full cards, Working as a row each (one line, two while subagents
  do its work), since it asks nothing of you yet, and Idle (nothing for 15 minutes or more) with its
  12px `muted-ink` note, folded behind a small ghost "Show n idle sessions" toggle, as a bare row
  each when open (absent when none idles). The group names are short status-board words kept in
  English in both languages, like "Live". An empty On you or Working says so in one 12px `muted-ink`
  line; with nothing running or the registry unreadable, one 14px `muted-ink` line replaces the
  groups (the chart stays: tokens come from the logs)
- **Pick up:** a card per session whose latest summary left work open, so the section stays a few
  cards however many items the week left. Shown: sessions idle under 48 hours, or under 7 days in a
  project that moved in the last 3 days, minus the running ones (Now has them) and hidden
  projects. Ranked by the heaviest thing left (waiting, then the next step, todo, issue, question),
  plus a little for an item naming an issue, PR or task, halved every 3 days since the block ended
  (`lib/pickUp.ts`). At most 5 cards and 2 per project; the rest behind a small ghost "n more"
  toggle. Each card is outlined like a Working card (`border`, the project's 3px
  colored edge): the latest block's headline (14px medium, two lines at most; it opens the block)
  with the last activity in `numeral` at the right, the project in 12px `muted-ink`, then "Next"
  in 12px `muted-ink` before the next step (14px, two lines at most). A footer row holds an
  extra-small ghost toggle "n open items" (its items unfold below as in the summary view, with
  the kind tag and the hand closes), the waiting count in `warn` when there is one, and the
  drawer's resume button (copies `claude --resume`) at the right. With no card, one 14px
  `muted-ink` line says nothing is left open to pick up
- **Last workday:** the last day with work before today, from the summaries already written (no
  model call). The heading is followed by the day in `numeral` ("Yesterday", or its date) and,
  after a break of more than a day, "n days since the last work" in 12px `muted-ink`; a small ghost
  button at the right, "Open the day", opens it in the day page. Then one group per project, the
  busiest first, laid out like the summary view's project sections: the project's 2px colored rule,
  its name in 14px medium, and a row per block in time order with the headline (14px, one line,
  truncated) and its commits and PRs as nodes (`OutcomeTally`) at the right. The whole row opens
  the block; the selected one keeps the `accent` fill. Quick questions (the calendar's marks) and
  hidden projects are left out, and so is work that began the evening before (it belongs to that
  day). The last workday is the last day that has something to list (in the four weeks before
  today; otherwise one line suggests `kairos doctor`)

## Calendar (month and week)

- **Calendar:** CSS Grid with a 56px hour column. An hour is never shorter than 48px, or headings
  of short blocks become unreadable. On open, the hour height is chosen so 8:00–20:00 fits the screen
- **Short work is a mark, not a card.** Work under ten minutes (`MARK_MAX_MS`) is a short bar in
  its project color (3px tall, 10px wide) in a 14px strip on the left of the day column, at the
  time it happened; marks closer than 6px are pushed just below each other. They take no column
  ([why](decisions.md#short-work-is-a-mark)). Hovering shows the card's tooltip,
  clicking opens the drawer, and selection gets the `primary` outline. Judged by the real length
  (a block crossing midnight is whole); the work in progress stays a card. The strip appears only
  on days that have marks. A headless run's mark is split into two 4px dashes with a 2px gap: at
  3px an outlined bar has no hollow left to see, and a broken line already means headless
- **A burst of headless runs is one mark.** Runs of a project each starting within five minutes of
  the previous one's end (`RUN_GAP_MS`), and within 15 minutes of the first (`RUN_SPAN_MS`; runs
  with no project are never grouped), are drawn as a single mark at the first run: two rows of the
  headless dashes, 1px apart, so it reads as a stack. ([why](decisions.md#a-burst-of-headless-runs-is-one-mark)) Its tooltip says
  "n headless runs" with the span; clicking opens the first run (the first matching one during a
  search), and in the calendar layout the drawer's header gets a "Run n of m" line with ‹ › under
  the headline to step through the burst (↑ ↓ still walk all work). A loop's iterations, minutes
  or hours apart, stay one mark each at their real time
- **A block's height is its real length.** Blocks shorter than the minimum height (room for one
  heading) fill only their real length at full strength; the rest is a label area with a faint fill
  (40% of the block fill) and a faint left edge, so the card keeps its shape instead of looking cut off
- Concurrent blocks sit side by side; stacked blocks indent 8px so the colored edge below stays visible
- **Month view** is a Sunday-first grid of the month's weeks (padded with the adjacent months'
  days, their dates at 60% `muted-ink`; their work is shown too, dimmed to 60% as a state opacity
  that doesn't stack: a block already faded by the filter keeps its own fade, and a selected one
  stays at full strength. Work late on the 31st often runs into the 1st, and a blank cell there
  would read as a day without work). Time of day doesn't fit there, so each
  block is a 20px line in time order: the block's 3px project edge and fill (dim when
  unsummarized, by the Work block rule below), its heading on one line, and a node at the end when it made commits (filled for a
  PR). The date line holds the date (circled in indigo on today; opens the day), up to six marks
  for short work, and the day's working time. Rows share the height (never below room for two
  lines and "+n more"); what doesn't fit, including marks past six, becomes "+n more", which opens
  the day. Tooltips, selection and filter fading are the week view's
- **Day column headers** put the weekday above the date number: beside it, "5 月" reads as May in Japanese
- **Work block:** heading (summary headline, or the first prompt before summarizing). The time
  range in `numeral` follows on the selected block when there is room
  ([why](decisions.md#the-week-view-shows-a-time-range-only-when-selected)). The heading gives up lines to the time range rather than
  overlapping it. Unsummarized blocks use the dim fill and muted text, except the latest block of a
  session still running, which is only waiting for its summary; the week, month, day page and list
  use this one rule (`isDim` in `lib/selection.ts`), and a mark's tooltip notes it. A pulsing project-colored
  dot marks work in progress. Selected: a 2px `primary` outline over the normal fill, nothing more
  ([why](decisions.md#the-selected-block-is-only-outlined)). A headless run (`claude -p` / SDK; automation runs always
  show, trial runs (probes and checks) only when turned on in the "⋯" menu) keeps its project's color and fill but gets a dashed left edge: the
  solid edge is the branch of work you prompted (in the week and month views alike, and as a dashed lane on the day page; a mark
  breaks into two dashes instead). The tooltip says why, and the drawer heading carries a
  "Headless" `Tag` beside the project line. Filtered-out blocks fade to 30% opacity and drop behind matching ones where they
  overlap; hover or focus brings one back in full and on top
- **Moments (commit and PR nodes):** read like a git graph: the block's colored edge is the branch,
  and each commit or PR is a moment node ([DESIGN.md, Components](../../DESIGN.md#components)) hanging just inside it at the
  height of the minute it was made. Nodes stay a radius inside the
  block, which clips at its border. Moments less than 10px apart (a 7px node plus a 3px gap) merge
  into one pill spanning them, 3px longer per extra moment and filled when it holds a PR, so a burst
  of commits never reads as a single node. The block's tooltip lists each with its time, short
  SHA or PR number and title (up to six), which is where the week view shows their titles; screen readers get them
  (up to eight) through the button's description, since the nodes are drawn for the eye only

## Day page (Journal, day)

The day is read, not placed: a list of the day's work beside the selected block's detail
([why](decisions.md#the-day-is-a-list-not-a-grid)).

- **Layout:** the day's figures on one line (working time 14px in `ink` and semibold, then 12px blocks,
  Claude time, commits and PRs, snags in the warn tone, tokens and cost), then the list, scrolling
  on its own. The drawer is the page's detail pane on the right from `lg` up: always open, on the
  day's first block when none is chosen (or when stepping to another day), with no close button,
  and Esc does nothing there. Below `lg` it is the usual drawer, opened by a click and closable
- **Rows** in time order, each a card with `md` corners: the time range (`numeral`,
  `muted-ink`, a fixed 5.5rem column), then the heading (`text-body`, medium in `ink`; regular
  `muted-ink` when unsummarized, by the Work block rule), a meta line (project, worktree label,
  length), the summary's first two Resolved points (12px `ink`, two lines each; an older body's
  Outcome in their place), and the first three commits and PRs as moment labels (node, time, SHA
  or PR number, title) with "+n more". Between the meta line and Resolved, whose turn it was: a
  4px strip of the block's length (at most 12rem, at least 2rem) on a `muted` track, in the
  project color where Claude worked and `ink` where it waited on you
  ([why](decisions.md#the-turn-strip-marks-your-turn-in-ink)), then "● Claude 32m ● you 12m" (11px
  `muted-ink`, each with a 6px dot of its color, the times in `numeral`) as its key. What the log
  can't tell (a gap a notification ended, an interrupted turn) stays the bare track rather than a
  guess, and a permission prompt reads as Claude working. No strip for a burst of headless runs
  or a block from logs before turns were recorded. Hover fills the card with `accent`; selected is the 2px
  `primary` outline and nothing more. Work in progress ends with the pulsing dot. Filtered-out
  rows fade to 30% and come back on hover or focus
- **Lanes:** to the left of the cards, one 14px lane per session running at the same time, read
  like a git graph: a 2px line in the project color (dashed for a headless run), a 10px node in
  the same color on each of the session's rows, level with the heading's first line. A session's
  line runs from its first block until its work ends, so a long block's line passes the work that
  started while it ran, and a session's blocks hours apart stay one line. A lane is reused once
  its session is done. Work running in from the previous day or on into the next keeps its line
  to the list's edge
- **Quiet stretches:** a gap of 30 minutes or more with no work is one line ("1h 35m with no
  work", 11px `muted-ink`); the lines of sessions still going on pass through it
- Short work and headless runs are rows like the rest; a burst of headless runs is one row ("n
  headless runs" and its span), as it is one mark in the week view
- `j` / `k` step through the rows (and the pane with them), and the selected row scrolls into
  view

## Toolbar, search and filters

- **Place toggle:** the app's two places, "Today" and "Journal" (both kept in English in both
  languages, like "Live"), as a segmented toggle of words right after the mark, before what the
  place shows ([why](decisions.md#the-place-toggle-leads-the-toolbar)). Journal opens the calendar
- **Period button:** between the period arrows, named by the shown unit: "This week", "This month",
  "Today" (ja 今週 / 今月 / 今日), so in English it doesn't read as a second way to the Today page
- **Toolbar** groups its controls by spacing, not frames or divider rules: period navigation and
  search are frameless until hovered or used. The period (month / week / day) and the layout
  (calendar / Insights, the Journal's tabs, shown only there) are two separate controls: the period is an outlined dropdown,
  the layout a segmented toggle on its own track
  ([why](decisions.md#period-and-layout-are-two-controls))
- **Toolbar** controls are 32px tall (icons stay 16px), so they sit in the 64px bar without
  floating; the layout toggle's track is 32px with 28px segments inside. Elsewhere (popovers, the
  summary's tabs) controls stay 28px
- **Toolbar** never overflows: below `xl` the wordmark and the spacing after the mark go, and
  search shrinks to its icon until focused, opening to 192px rather than 256px, so the period label
  keeps its full width. Below `lg` (a half-screen window) the gaps narrow, the open field is 128px
  and its results span the screen. No control is dropped
- **Toolbar** holds only the place toggle, view switching, date navigation, search, the standup
  menu, filters and the Live button. Theme, language and the shortcut list live in the "⋯" menu
- **Standup menu:** a small ghost button on every page, a clipboard icon, "Standup" (the icon alone
  below `xl`, so the period label keeps its width) and a chevron, whose icon and tooltip say for a
  moment how the copy went (a `primary` check, "Copied as Markdown"; a struck circle, "No work to
  copy"), keeping its width. Its popover lists the periods as small ghost rows, each with a note in
  12px `muted-ink` at the right: Last workday (its date, found from the work like Today's; disabled
  when there is none in four weeks), Today, This week, and on a page with a period, the period on
  screen ("Filters apply"), set apart by a rule. The report is fetched on click and built by
  `shared/report.ts`, as `kairos report` is
- **Filters** are edited in the toolbar's popover (384px wide, scrolling within the window) and,
  while any applies, listed as chips in a row under the toolbar, so what narrows the view stays in
  sight with the popover closed. ([Not a
  sidebar](decisions.md#filters-in-a-popover-not-a-sidebar).)
  The popover groups conditions by what they ask — Made (any of them), State (all of them), Length
  (a segmented toggle), Branch (a dropdown of the period's branches) — then quick questions, then
  projects. Each option shows how many of the period's blocks it alone would keep, in `numeral`
- **Filter chips:** 24px pills on `surface` with a `line` border and 12px text, each with a 20px
  × button (`muted-ink`, `accent` on hover); outcomes share one chip ("Commit or PR merged")
  because they combine as "any of", states get one each. "Clear all" follows when there are two
  or more. Neutral, not indigo: they are a reminder of the state, not a selection
- **File button in the search field:** a 20px toggle at the field's right end (left of the clear
  ×), shown once the field is in use or the button is on. On, it takes the `primary` tint
  (`primary` at 15% behind an indigo icon) and the words search edited file paths only, as if each
  were written `file:<word>`. It sits inside the field, like an editor's match-case toggle, rather
  than adding a control to the toolbar. Pressing it keeps the caret in the field; the field sizes
  by `focus-within` so it doesn't shrink while the button has focus
- **Command palette (⌘K; Ctrl+K outside a text field, where macOS deletes to the line's end):** a dialog 40rem wide (less on a narrow screen),
  12vh from the top over a 30% black scrim (the overlaid drawer's), on `popover` with the `lg` radius and
  the overlaid drawer's `shadow-2xl`, since it sits in front of everything. A 48px field with the
  search icon, then the rows, scrolling within 76vh, under small medium-weight `muted-ink` group
  headings: Date
  (when the query names a day: "2026-09-30", "9/30", "9月30日", "yesterday", "昨日", "tue",
  "last tue", "先週の火曜"; a bare weekday is the latest one up to today, "last" is the one in the
  previous Sunday-first week), Go to, View, Copy, Projects, Settings, then Work (the first eight
  search hits, drawn as in the search field's panel). Each command ends with the key cap that
  does the same outside the palette, so the palette teaches the keys; a command with a key runs
  exactly as the key does. The active row has the `accent` fill; ↑ ↓ move (wrapping), Enter
  runs, Esc closes. Settings are offered as the change they make ("Theme: Dark"), and each
  project as showing or hiding it, listed only once a query is typed so they don't bury the
  rest. Reports appear once the projects are known (as in the standup menu), and a copy waits for
  what it needs (the last workday, the session) rather than finding nothing. A copy keeps the
  palette open and says at its foot how it went; anything else closes it first, then runs, and
  each opening starts from an empty field.
  The toolbar stays as it is

## Thread page

The sessions behind one piece of work, at `/thread/<session>`. Opened from the drawer's session
flow ("Thread · n sessions", shown when more than the session itself is tied in) or ⌘K's "Open
the open session's thread"; a PR leads there through the drawer of a block that opened or merged
it. Neither place in the toolbar is lit; the toolbar has no period there.

- **Head:** "Goal" in the small heading style, the Goal of the thread's earliest summarized block
  in `text-title` semibold `ink` (a muted line while no summary has one), then the sessions,
  blocks and dates on one `numeral` meta line
- **Sessions:** one line each, oldest first: a dot in its project's color (its lane's below), the title (opens
  its first block), then project, branch and how it came in ("one conversation, continued", "same
  PR #12", "same branch fix/login", "an item one left open, the other closed"; "opened here" for the
  one the page was opened from), 12px `muted-ink`
- **Days:** each day the thread worked, its date as a heading, then the day page's rows and lanes
  for the thread's blocks of that day (nothing fades: a thread has no filter)
- **Items:** what its blocks left open, "Still open (n)" then "Settled (n)", laid out like the
  drawer's Open list: kind tag, text, and a link to the block that left it ("since Mon, Oct 5") or
  how it closed. No hand edits here
- The drawer opens over the page, as on Today

## Drawer

- **Drawer** opens from the right with 20px padding; below `lg` it overlays the screen with a backdrop.
  In the week and month calendars it also floats over the calendar (no backdrop) up to `xl`
  ([why](decisions.md#the-drawer-floats-over-the-calendar)), and on Today too. The list and
  summary still make room for it, and the day page holds it as its detail pane
- **Drawer header:** the headline in its project-colored frame, then when it happened (date and
  range in `ink`, length in `muted-ink`, no chip) and the key figures on a second line
- **Drawer:** the selected section's summary first (its heading in `ink` rather than muted, the
  model that wrote it beside the Regenerate button), then session flow, outcomes, conversation
  (collapsed at first) and numbers. Blocks are separated by spacing alone: no rule after the
  heading and no surface behind the summary
- **Section summary:** read as Goal → what came of it → Done, each at its own weight, so why the
  work was done and what came of it are read before how. The Goal is the lead sentence with no
  label (`summary-lead`, `ink`). What came of it is Resolved, Open and Next (an older body's single
  Outcome in their place), all `summary-body`, `ink`; Resolved (or Outcome) carries the commit or
  PR node when it names one of the section's own. Open items lead with their kind (to do, issue,
  question, waiting) as a `Tag` (no bullets), a label rather than a column, with no color of its own; the
  warn tone stays the snags'. The tag is in English in either UI language. When the ledger tracks
  the section's items, each row ends with the summary view's hand edits (done, won't do, not an
  open item); one closed since turns `muted-ink` and ends with how it closed (12px `muted-ink`,
  the link to the block that closed it when one did), plus undo when closed by hand, so the list still reads as what the section left open.
  A single Resolved point is shown without a bullet. Done's points are 14px `muted-ink`, each
  clamped to two lines with "Show in full" when one is cut off. Every item but the Goal gets a
  label in the drawer's small heading style. A body in neither format is shown as written. The
  day page's rows show the first Resolved points: the heading says what, Resolved what came of
  it. A block marks nothing for its open items; its tooltip counts them with their kinds ("Open 2
  (Question · Waiting)", kinds in a fixed order and, unlike the tags, in the UI language), and
  the filter's "Left something open" state finds them
- **Settled from earlier (drawer):** after the summary, the earlier open items the section
  settled, laid out like its Open list, each ending with "left open Mon, Oct 5" linking to the
  block that left it. Shown even for a section without a summary

## Insights (summary view)

- **Summary totals:** set apart by the column gap and their value sizes, with no rules between them. Three tiers. Working time leads (28px); outcomes (commits, PRs, with their
  nodes) follow in `ink` (20px); spend (tokens, cost) is smaller (16px) and `muted-ink`, as
  context rather than achievement
- **Open items (summary view):** under each project's recap, inside the same colored rule, a
  label in the drawer's small heading style ("Open (5)") with the period's change at its right
  (`numeral`, `muted-ink`: "+3 / −4 this week"). Rows are the drawer's Open list again: the kind
  tag, then the text (14px `ink`), newest first and not grouped by kind.
  Each row ends with how long it has been open ("since Mon, Oct 5", then "week 2"), 12px
  `muted-ink` `numeral`, which is the link to the block that left it, and three 24px ghost icon
  buttons (done, won't do, not an open item) with their names in a tooltip. Items open 4 weeks or more fold into
  "Open 4 weeks or more (n)" with their text at 60% opacity (the age and buttons stay readable); items closed in the period fold into
  "Closed this week (n)" with muted text and how each closed (the link to the block that closed
  it, when one did; undo for one closed by hand). A failed close or undo shows under the list in
  `destructive`. No color or surface of its own beyond the kind tags: it is part of the
  recap's frame. A project with no work in the period but items still open gets its name and the
  list alone, under its colored rule, after the projects with work

## Running sessions

How Today's Now and the toolbar draw the sessions running now.

- **Live button:** a ghost button at the right of the toolbar, before the Standup menu, that opens Today, pressed (`muted`
  fill, `ink` text) there: a 6px dot (`ink` pulsing while a session works, `muted-ink` otherwise, a
  ring when nothing runs; not indigo, which would mark it selected, nor a project color, since it
  stands for every project), the word "Live", and the number of sessions waiting on you in
  `numeral` `warn`. The tab title leads with the same number ("(2) Kairos"), so a background tab
  still says so
- **Card weight says whose turn it is:** a card keeps a work block's 3px project-colored edge but
  not the block fill ([why](decisions.md#live-cards-carry-no-block-fill)). A card in On you sits on
  the neutral `muted` fill (`input` on hover, since `accent` barely differs from `muted` in dark), a
  Working card is only outlined in `line` (`muted` on hover), and an idle session is a bare row. The
  selected card is outlined in `primary`. No opacity: cards stay readable
- **State dot:** Working pulses in the project color, asking is a solid `warn` dot with its state
  word in `warn`, waiting and idle are a `muted-ink` ring
- **Card head:** the 6px state dot and the title (14px medium, two lines at most; `muted-ink` when
  idle), the project, worktree and branch (12px `muted-ink`, with a compact "Background" `Tag`). At
  the right of the title, the state word (only in On you, which holds two states; elsewhere the
  group names it) and how long it has lasted, coarsening to whole hours from 3h and days from 24h,
  with the start time under it at the right of the place line (`numeral`, with the date when not
  today)
- **Card body, what it is doing:** the question (14px `ink`); the call in flight (tool name in
  medium, an MCP tool as "server › tool", its summary in `muted-ink`). While one subagent stands for
  what the session does (the single foreground one the turn waits on, or else the single background
  one still running), its call shows as well: in place of the session's own for a foreground one
  (which the session's call only says runs), under it for a background one; with "by <name>", what
  it was asked and how long it has run under it in `muted-ink` (while it thinks, the session's own
  call stands in for a foreground one, and what it was asked otherwise); that subagent is then left
  out of the list below. A batch of subagents launched in one response (parallel reviewers) shows
  "Subagents 2/4 done" with the tasks' bar. Then its subagents as a list nested under it by indent
  alone (no rule: the edge, fill and footer rule already frame the card), at most three rows,
  running ones first, then "+n more". Each subagent row has a 6px dot (pulsing in the project color
  while it runs, a `muted-ink` ring once done), its name in medium (its own, as a skill run in a
  subagent has, else its type; `muted-ink` once done), what it was asked in `muted-ink`, how long it
  has run at the right in `numeral` ("Done" once done, kept two minutes), and the call it is in
  under it. Then tasks as a 4px bar in the project color on `input` (the card is already `muted`,
  which `line` barely differs from), the last test (its word in `warn` when it failed), and Claude
  Code's recap while it isn't working (three lines)
- **Card footer, gauges:** under a rule (`line`, `input` on the `muted` fill), all 12px
  `muted-ink`. The context against the model's window ("Context 148k / 1M") with a short 48px 4px
  bar after it in `muted-ink` on `input` (short and neutral, so it doesn't read as the tasks' bar),
  `warn` (bar and words) from 80% of the window in On you only, where the next prompt is the time to
  compact or clear, with the model and a compact "Fast" `Tag` at the right when fast mode multiplies
  it. Then the current block's tokens ("This block 2.1M"), with the rate in tokens per hour at the
  right while working, or the prompt cache while not: how long it stays warm ("Cache 57m left"), or
  "Cache expired", when a reply rewrites the whole context. In On you the countdown turns `warn` in
  the last sixth of the cache's TTL (10 minutes of an hour), the one moment the cache asks something
  of you; elsewhere it stays `muted-ink`, or a group of idle sessions would all call for you
- **Idle row:** a single row instead of a card: the edge with no fill (`muted` on hover), the dot,
  the title on one line with how long it has idled at its right, and the place under it (and "Not in
  the log yet" when there is nothing to open). The place line ends with how many subagents still run
  (`numeral` `muted-ink`; background ones go on while the session waits) and the cache. Its details
  are in the drawer. The rows Today lists for Working sessions are the same, with one more line
  while subagents do the work: "by <name>" in `muted-ink` and the delegate's call (or what it was
  asked, while it thinks), then a batch's "Subagents 2/4 done" bar, while the place line keeps its
  count of running subagents. Without subagents a row stays one line, and an idle row never gets it
- **Opening:** the title is the card's button; clicking anywhere else on the card does the same
  unless it ends a text selection, so a question or command can still be copied. It opens the
  latest work block in the drawer, which floats over Today as in the week view. A session not in
  the log yet has nothing to open, so its card is plain content (no pointer, no hover fill). Only a
  card or row that opens takes a hover fill (`input` on a card, `muted` on an idle row), and keyboard
  focus on its title draws the 2px `ring` outline around the card
- **Token band:** at the head of Now, under its heading. It shows tokens rather than
  cost ([why](decisions.md#the-token-chart-counts-tokens-not-cost)): every token column, as the
  drawer's "Tokens" counts them, over every visible session, not only the running ones. At the top
  left, "Tokens today" and "Rate" (per hour), each a 12px `muted-ink` label over its figure in the
  17px medium numeral face; beside them a 12px line that names what pointing shows. The band stays,
  with its note, when nothing runs or the registry can't be read
- **Plan limits:** after "Rate", as a group of their own that moves under the token figures where
  Now's column is narrow, when `kairos statusline` has recorded any, one figure per window ("5-hour
  limit", "Weekly limit") in the same 12px `muted-ink` label: its used share in the 17px numeral
  face, a 4px × 48px bar like a live card's context gauge (`muted-ink` on `input`), and "resets
  15:30" (the weekday too on another day) in 12px numeral `muted-ink`, kept on one line. Share and
  bar turn `warn` from 80% used, when what is left may not see the work through. A window past its
  reset reads 0% and "reset"; one Claude Code didn't report is left out. When the reading is 10
  minutes old or more, the band's note (prose, so not in the numeral face) adds "Limits as of
  14:05", since the limits move only while Claude Code runs
- **Token chart:** under the figures, across Now's column, the day's tokens as they climbed: one band
  per project stacked from the floor (largest at the bottom), each the project's block fill
  (`--mix-block` into `block-base`, as on the calendar) under a 1.5px line in the full project color
  along its top, so the height at the right end is today's total and the slope is the pace ([why](decisions.md#the-token-chart-climbs-instead-of-standing-in-bars)). Within a
  5-minute slot a band rises in a straight line, since its tokens came in over those minutes. The
  chart starts on the whole hour before the day's first use, but spans at least the last three hours
  and never starts before midnight (the figures count from there), on a `line` floor, 112px tall.
  Where the top edge meets the right end sits the calendar's indigo now dot, ringed by the surface,
  with "Now" under it in `primary`; the start time is at the left end and hours between in 12px
  `numeral` `muted-ink`, every 1–6 hours as the span needs. Each band is named at its end, in a
  column to the right (no legend): a 4×10px swatch in its color, its name in `muted-ink` and its
  tokens in `ink` numerals, pushed apart where bands are thin, the smallest left unnamed when they
  don't fit. Pointing at the chart (a tap on touch screens, which toggles) lights the 5-minute slot
  under it as a `muted` column and swaps the line beside the figures for the slot's time range and
  what it added in `ink` numerals, then each project's color dot, name and tokens in `muted-ink`.
  Under the chart, one note in 12px `muted-ink`: cache reads are counted and usually make up most of
  the total, which would otherwise look implausibly large
