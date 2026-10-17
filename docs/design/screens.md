# Kairos screens

How each screen applies [DESIGN.md](../../DESIGN.md): its layout, sizes and states. The principles,
tokens and shared components are there; why a screen bends a rule is in
[decisions.md](decisions.md).

## Calendar (month, week and day)

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
  range in `numeral` follows when there is room, but in the week view only on the selected block
  ([why](decisions.md#the-week-view-shows-a-time-range-only-when-selected)). The heading gives up lines to the time range rather than
  overlapping it. Unsummarized blocks use the dim fill and muted text, except the latest block of a
  session still running, which is only waiting for its summary; the week, day, month and list views
  use this one rule (`isDim` in `lib/selection.ts`), and a mark's tooltip notes it. A pulsing project-colored
  dot marks work in progress. Selected: a 2px `primary` outline over the normal fill, nothing more
  ([why](decisions.md#the-selected-block-is-only-outlined)). A headless run (`claude -p` / SDK, shown only when
  turned on in the "⋯" menu) keeps its project's color and fill but gets a dashed left edge: the
  solid edge is the branch of work you prompted (in the week, day and month views alike; a mark
  breaks into two dashes instead). The tooltip says why, and the drawer heading carries a
  "Headless" `Tag` beside the project line. Filtered-out blocks fade to 30% opacity and drop behind matching ones where they
  overlap; hover or focus brings one back in full and on top
- **Moments (commit and PR nodes):** read like a git graph: the block's colored edge is the branch,
  and each commit or PR is a moment node ([DESIGN.md, Components](../../DESIGN.md#components)) hanging just inside it at the
  height of the minute it was made. Nodes stay a radius inside the
  block, which clips at its border. Moments less than 10px apart (a 7px node plus a 3px gap) merge
  into one pill spanning them, 3px longer per extra moment and filled when it holds a PR, so a burst
  of commits never reads as a single node. The day view adds a lane beside each block's text
  (`min(38%, 24rem)`, a faint rule on its left; only on blocks at least 36rem wide with room for
  two labels, so side-by-side and stacked blocks on a busy day fall back to the tooltip) labeling each node with its time, short SHA or PR
  number and title; labels push apart to avoid overlapping and end in "+n more" when they run out
  of room. The block's text keeps a 32rem measure and the lane starts right after it, so on a wide
  screen the summary and its commits stay together instead of sitting at opposite edges (a
  narrower block puts the lane at its right edge). The block's tooltip lists the
  same (up to six), which is where the week view shows their titles; screen readers get them
  (up to eight) through the button's description, since the nodes are drawn for the eye only

## Toolbar, search and filters

- **Toolbar** groups its controls by spacing, not frames or divider rules: period navigation and
  search are frameless until hovered or used. The period (month / week / day) and the layout
  (calendar / summary) are two separate controls: the period is an outlined dropdown,
  the layout a segmented toggle on its own track
  ([why](decisions.md#period-and-layout-are-two-controls))
- **Toolbar** controls are 32px tall (icons stay 16px), so they sit in the 64px bar without
  floating; the layout toggle's track is 32px with 28px segments inside. Elsewhere (popovers, the
  summary's tabs) controls stay 28px
- **Toolbar** never overflows: below `lg` (a half-screen or small-laptop window) the wordmark and
  the spacing go, search shrinks to its icon until focused, and its results span the screen. No
  control is dropped. Between `lg` and `xl` the open search field is 192px rather than 256px, so the
  period label beside it keeps its full width
- **Toolbar** holds only view switching, date navigation, search, report copy, filters and the
  live page's button. Theme, language and the shortcut list live in the "⋯" menu
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

## Drawer

- **Drawer** opens from the right with 20px padding; below `lg` it overlays the screen with a backdrop.
  In the week and month calendars it also floats over the calendar (no backdrop) up to `xl`
  ([why](decisions.md#the-drawer-floats-over-the-calendar)), and on the live page too. The day view, list and
  summary still make room for it
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
  day view's block body shows only the Goal: the heading says what, the lane what came of it. A
  block marks nothing for its open items; its tooltip counts them with their kinds ("Open 2
  (Question · Waiting)", kinds in a fixed order and, unlike the tags, in the UI language), and
  the filter's "Left something open" state finds them
- **Settled from earlier (drawer):** after the summary, the earlier open items the section
  settled, laid out like its Open list, each ending with "left open Mon, Oct 5" linking to the
  block that left it. Shown even for a section without a summary

## Summary view

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

## Live page

The sessions running now, on a page of its own (`?layout=live`, `n`), opened from the toolbar's
"Live" button.

- **Live button:** a ghost button beside the layout toggle, pressed (`muted` fill, `ink` text) on
  the page: a 6px dot (`ink` pulsing while a session works, `muted-ink` otherwise, a ring when
  nothing runs; not indigo, which would mark it selected, nor a project color, since it stands for
  every project), the word "Live", and the number of sessions waiting on you in `numeral` `warn`.
  The tab title leads with the same number ("(2) Kairos"), so a background tab still says so
- **Header:** the page has no period, so the period navigation, date picker, period dropdown,
  search, report copy and filters give way to its 17px heading (search narrows a period too)
- **Columns:** the body sits on `surface` in three columns (one below `lg`): On you (asking or done
  with a turn), Working, Idle (nothing for 15 minutes or more). The column names are short
  status-board words kept in English in both languages, like "Live"; their notes are translated. A
  column heading is 14px medium with its count beside it in the numeral face at the heading's size
  (`warn` for a non-empty On you) and a 12px `muted-ink` note on what puts a session there. An
  empty column says "None"; an empty On you says "Nothing is waiting on you" and narrows to 13rem,
  giving its third of the width to the cards
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
  column names it) and how long it has lasted, coarsening to whole hours from 3h and days from 24h,
  with the start time under it at the right of the place line (`numeral`, with the date when not
  today)
- **Card body, what it is doing:** the question (14px `ink`); the call in flight (tool name in
  medium, an MCP tool as "server › tool", its summary in `muted-ink`); its subagents as a list
  nested under it by indent alone (no rule: the edge, fill and footer rule already frame the card),
  at most three rows, running ones first, then "+n more". Each subagent row has a 6px dot (pulsing
  in the project color while it runs, a `muted-ink` ring once done), its type in medium (`muted-ink`
  once done), what it was asked in `muted-ink`, how long it has run at the right in `numeral`
  ("Done" once done, kept two minutes), and the call it is in under it. Then tasks as a 4px bar in
  the project color on `input` (the card is already `muted`, which `line` barely differs from), the
  last test (its word in `warn` when it failed), and Claude Code's recap while it isn't working
  (three lines)
- **Card footer, gauges:** under a rule (`line`, `input` on the `muted` fill), all 12px
  `muted-ink`. The context against the model's window ("Context 148k / 1M") with a short 48px 4px
  bar after it in `muted-ink` on `input` (short and neutral, so it doesn't read as the tasks' bar),
  `warn` (bar and words) from 80% of the window in On you only, where the next prompt is the time to
  compact or clear, with the model and a compact "Fast" `Tag` at the right when fast mode multiplies
  it. Then the current block's tokens ("This block 2.1M"), with the rate in tokens per hour at the
  right while working, or the prompt cache while not: how long it stays warm ("Cache 57m left"), or
  "Cache expired", when a reply rewrites the whole context. In On you the countdown turns `warn` in
  the last sixth of the cache's TTL (10 minutes of an hour), the one moment the cache asks something
  of you; elsewhere it stays `muted-ink`, or a column of idle sessions would all call for you
- **Idle row:** a single row instead of a card: the edge with no fill (`muted` on hover), the dot,
  the title on one line with how long it has idled at its right, and the place under it (and "Not
  in the log yet" when there is nothing to open). The place line ends with how many subagents still
  run (`numeral` `muted-ink`; background ones go on while the session waits) and the cache. Its
  details are in the drawer
- **Opening:** the title is the card's button; clicking anywhere else on the card does the same
  unless it ends a text selection, so a question or command can still be copied. It opens the
  latest work block in the drawer, which floats over the page as in the week view. A session not in
  the log yet has nothing to open, so its card is plain content (no pointer, no hover fill). Only a
  card or row that opens takes a hover fill (`input` on a card, `muted` on an idle row), and keyboard
  focus on its title draws the 2px `ring` outline around the card
- **Token band:** above the columns, separated by a `line` rule. The page shows tokens rather than
  cost ([why](decisions.md#the-live-page-counts-tokens-not-cost)): every token column, as the
  drawer's "Tokens" counts them, over every visible session, not only the running ones. At the top
  left, "Tokens today" and "Rate" (per hour), each a 12px `muted-ink` label over its figure in the
  17px medium numeral face; beside them a 12px line that names what pointing shows. The band stays,
  with its note, when nothing runs or the registry can't be read
- **Token chart:** under the figures, across the page, the day's tokens as they climbed: one band
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
