---
version: alpha
name: Kairos — Indigo hours
description: >-
  A quiet calendar for looking back on Claude Code work. The frame stays neutral, work blocks
  carry calm mineral-pigment colors, and indigo marks selection, focus and the current time.
  Tokens are the light theme; `-dark` tokens are their dark-theme counterparts. The source of
  truth is src/web/src/index.css — keep both in sync.
colors:
  primary: "#2e4c8c"
  on-primary: "#ffffff"
  background: "#f6f7f9"
  surface: "#ffffff"
  popover: "#ffffff"
  ink: "#1b2333"
  muted: "#eef1f5"
  muted-ink: "#6a7385"
  accent: "#e8edf6"
  line: "#e2e6ec"
  input: "#d7dce4"
  warn: "#8a6420"
  destructive: "#b4413a"
  block-base: "oklch(1 0 0)"
  primary-dark: "#8da8e8"
  on-primary-dark: "#10182a"
  background-dark: "#10182a"
  surface-dark: "#172238"
  popover-dark: "#1b2840"
  ink-dark: "#e3e8f2"
  muted-dark: "#1f2c45"
  muted-ink-dark: "#8f9ab0"
  accent-dark: "#22314f"
  line-dark: "#24304a"
  input-dark: "#2e3c5a"
  warn-dark: "#d1a650"
  destructive-dark: "#e07a72"
  block-base-dark: "oklch(0.255 0 0)"
  project-gunjo: "#4f6faf"
  project-rokusho: "#3f8f80"
  project-odo: "#c0923a"
  project-fuji: "#8c70b5"
  project-sakuranezumi: "#b07c88"
  project-tetsu: "#5e6b7d"
  project-wakatake: "#5f9a4f"
  project-bengara: "#a4553f"
  project-gunjo-dark: "#6f8fd0"
  project-rokusho-dark: "#57ab9b"
  project-odo-dark: "#d1a650"
  project-fuji-dark: "#a68bd0"
  project-sakuranezumi-dark: "#c995a1"
  project-tetsu-dark: "#8592a6"
  project-wakatake-dark: "#7bb56b"
  project-bengara-dark: "#c4735c"
typography:
  body:
    fontFamily: IBM Plex Sans JP
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: '"palt"'
  label:
    fontFamily: IBM Plex Sans JP
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.375
  block-heading:
    fontFamily: IBM Plex Sans JP
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.375
  drawer-title:
    fontFamily: IBM Plex Sans JP
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.375
    letterSpacing: -0.025em
  summary-body:
    fontFamily: IBM Plex Sans JP
    fontSize: 15px
    fontWeight: 400
    lineHeight: 28px
  numeral:
    fontFamily: IBM Plex Sans Condensed
    fontSize: 11px
    fontWeight: 500
    fontFeature: '"tnum"'
  wordmark:
    fontFamily: Syne
    fontSize: 21px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: -0.01em
rounded:
  sm: 4.8px
  md: 6.4px
  lg: 8px
  xl: 11.2px
  full: 9999px
spacing:
  unit: 4px
  hour-gutter: 56px
  hour-min: 48px
  stack-indent: 8px
  drawer-padding: 20px
components:
  work-block:
    backgroundColor: "{colors.block-base}"
    textColor: "{colors.ink}"
    typography: "{typography.block-heading}"
    rounded: "{rounded.md}"
    padding: 6px
  work-block-unsummarized:
    textColor: "{colors.muted-ink}"
    typography: "{typography.label}"
  calendar-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  hour-label:
    textColor: "{colors.muted-ink}"
    typography: "{typography.numeral}"
  drawer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "{spacing.drawer-padding}"
  drawer-title:
    textColor: "{colors.ink}"
    typography: "{typography.drawer-title}"
  section-summary:
    textColor: "{colors.ink}"
    typography: "{typography.summary-body}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    height: 28px
  segmented-toggle:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.md}"
    height: 28px
  segmented-toggle-on:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  popover:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 10px
  attention-number:
    textColor: "{colors.warn}"
    typography: "{typography.numeral}"
  error-text:
    textColor: "{colors.destructive}"
  wordmark:
    textColor: "{colors.ink}"
    typography: "{typography.wordmark}"
---

# Kairos Design

Direction **"Indigo hours"**, chosen on 2026-10-05 from three compared proposals
([comparison page](https://claude.ai/artifact/Bgd1XQLQL67RRbRJH36ZaY)).

## Overview

A personal tool for looking back at what you did and when. The screen is "calendar or summary +
drawer" and nothing more, so the work itself is the loudest thing on it.

- **Chronos is the frame, kairos is the mark.** The grid, rules and block heights are clock time
  (chronos), and stay quiet. What the app is named for, the moments that mattered (kairos), is
  drawn on top: each commit and PR is a node on its block's edge at the minute it was made. This
  is the one place the design spends its boldness
- **Keep the frame quiet so the work blocks carry the color.** Toolbar, time column and rules are
  neutral; the time column has plain, muted hour labels (it once shifted through the colors of the
  day, and was dropped because it competed with the blocks)
- **One accent.** Indigo (`primary`) means "selected", "focused" or "now". Don't use it for decoration
- **Calm, not dated.** Japanese mineral pigments (iwa-enogu) rather than saturated UI colors
- English UI by default with Japanese available; light and dark themes, following the OS by default

## Colors

Tokens map to CSS variables in `src/web/src/index.css` (shadcn/ui names): `surface` → `--card`,
`ink` → `--foreground`, `muted-ink` → `--muted-foreground`, `line` → `--border`. The dark theme
swaps every value for its `-dark` token under `.dark`.

- **Primary (indigo `#2e4c8c` / `#8da8e8`):** selection (including the selected block's outline),
  the current-time line, focus rings and links. Not for headings or surfaces
- **Background / Surface:** the screen is slightly grey; the calendar body and the drawer sit on
  white (navy in dark) surfaces
- **Warn (`#8a6420`):** text of numbers that need attention (snags). Plain yellow ocher lacks
  contrast on white, so it is darkened
- **Destructive:** error messages only

### Project colors

Eight mineral pigments, assigned in order to projects without a chosen color (`--p0`…`--p7`):
gunjō (ultramarine), rokushō (verdigris), ōdo (yellow ocher), fuji (wisteria), sakuranezumi
(cherry grey), tetsu (iron), wakatake (young bamboo), bengara (red oxide). Unknown projects use tetsu.

### Block fills

A work block's fill is the project color mixed into `block-base` in `oklch`:

| State | Light | Dark |
|---|---|---|
| Normal (`--mix-block`) | 20% | 32% |
| Hover (`--mix-block-hover`) | 32% | 44% |
| Selected (`--mix-block-selected`) | 42% | 50% |
| Not yet summarized (`--mix-block-dim`) | 9% | 14% |

- `block-base` is achromatic; in CSS it is written with hue `none` (`oklch(1 0 none)`), which the token format can't express, so the mix keeps each project's hue. Mixing into the
  navy card turned ochre and red oxide the same brown
- Dark mixes in more, or the colors turn muddy grey on navy and projects become indistinguishable

## Typography

- **IBM Plex Sans JP** (400 / 500 / 600) for body and UI. It covers both the English and the
  Japanese UI. `palt` is on for the body so Japanese punctuation sits tight
- **IBM Plex Sans Condensed** (500 / 600) with tabular figures for times, dates and numbers — use
  the `font-num` utility. Condensed figures fit narrow day columns and don't jitter as they change
- **Syne SemiBold** only for the "Kairos" wordmark in the header (Latin subset). A face used nowhere
  else, so the name reads as a name rather than a label
- The UI is dense: most text is 12–14px; metadata and hour labels are 11px; the drawer title (17px)
  and the section summary (15px, relaxed leading) are the only large text, because that is where you read

## Layout

- Spacing follows Tailwind's 4px scale; most gaps are 2–8px
- **Calendar:** CSS Grid with a 56px hour column. An hour is never shorter than 48px, or headings
  of short blocks become unreadable. On open, the hour height is chosen so 8:00–20:00 fits the screen
- **A block's height is its real length.** Blocks shorter than the minimum height (room for one
  heading) fill only their real length at full strength; the rest is a label area with a faint fill
  (40% of the block fill) and a faint left edge, so the card keeps its shape instead of looking cut off
- Concurrent blocks sit side by side; stacked blocks indent 8px so the colored edge below stays visible
- **Day column headers** put the weekday above the date number: beside it, "5 月" reads as May in Japanese
- **Drawer** opens from the right with 20px padding; below `lg` it overlays the screen with a backdrop
- **Toolbar** holds only view switching, date navigation, search, report copy and filters. Theme,
  language and the shortcut list live in the "⋯" menu

## Elevation & Depth

Few cards and few shadows. Boundaries are 1px `line` rules. Only floating things lift:

- The drawer, when it overlays on narrow screens (`shadow-2xl`)
- Popovers and the search results (`shadow-md`)
- The active segment of a segmented toggle (`shadow-sm`)

Stacked work blocks get a 1px `surface`-colored outline, not a shadow, to separate them.

## Shapes

- Base radius is 8px (`--radius`); `sm`/`md`/`lg`/`xl` are 0.6×/0.8×/1×/1.4× of it
- **Work blocks:** a 3px left border in the project color, 3px radius on the left and `md` on the
  right. Blocks continuing from the previous or into the next day drop the radius on that side
- Buttons and toggles use `md`; popovers use `lg`; dots and count badges are `full`

## Components

- **Work block:** heading (summary headline, or the first prompt before summarizing), then the time
  range in `numeral` when there is room; the heading gives up lines to the time range rather than
  overlapping it. Unsummarized blocks use the dim fill and muted text. A pulsing project-colored
  dot marks work in progress. Selected: selected fill plus a 2px `primary` outline. Filtered-out
  blocks fade to 30% opacity and come back on hover or focus
- **Moments (commit and PR nodes):** read like a git graph: the block's colored edge is the branch,
  and each commit is a 7px `ink` ring (filled with `surface`) hanging just inside it at the height
  of the minute it was made; a PR is the same node filled with `ink`. Nodes stay a radius inside the
  block, which clips at its border. The day view adds a lane on the right of each block
  (`min(38%, 24rem)`, a faint rule on its left) labeling each node with its time, short SHA or PR
  number and title; labels push apart to avoid overlapping and end in "+n more" when they run out
  of room. The block's text keeps a 72ch measure beside the lane. The block's tooltip lists the
  same (up to six), which is where the week view shows their titles; screen readers get them
  (up to eight) through the button's description, since the nodes are drawn for the eye only
- **The node is the app's word for commit and PR.** Wherever a count or list of them appears (day
  headers, the drawer's figures, Session flow rows, Outcomes, list cells, the summary's totals)
  it uses the same ring and filled node (`components/MomentNode.tsx`), not icons. The drawer's
  Outcomes list is in time order with the nodes on a thin `line` rule, like the block's edge
- **Summary totals:** three tiers. Working time leads (28px); outcomes (commits, PRs, with their
  nodes) follow in `ink` (20px); spend (tokens, cost) is smaller (16px) and `muted-ink`, as
  context rather than achievement
- **Drawer:** the selected section's summary first (on a neutral `muted` surface with a faint
  `ink` rule; its heading in `ink` rather than muted), then session flow, outcomes, conversation
  (collapsed at first) and numbers
- **Mark:** `src/web/public/favicon.svg` — a circle with a dawn → evening → night gradient cut by a
  diagonal blade (Kairos stands on a razor's edge: cutting out a single moment). The background
  shows through the gap, so it reads on light and dark tabs; the gap stays open at 16px. Used for
  the favicon, the header (with a progress ring while ingesting) and the README
- shadcn/ui primitives live in `src/web/src/components/ui/`; add new ones there rather than
  styling Radix directly in feature components

## Do's and Don'ts

- **Do** use the theme tokens (`bg-card`, `text-muted-foreground`, `text-primary`, `var(--p3)`…);
  **don't** hard-code hex values in components
- **Do** add new colors to both `:root` and `.dark` in `index.css`, and here
- **Do** mix project colors in `oklch` into `--block-base`; **don't** mix into `--card` or use opacity
- **Do** use `font-num` for any time, date, count or cost
- **Don't** add new accent colors, gradients or decorative shadows to the frame — color belongs to
  the work blocks
- **Don't** add controls to the toolbar; put rarely used settings in the "⋯" menu
- **Don't** hard-code UI copy; it goes in the `en` / `ja` dictionaries (`.claude/rules/web.md`)
- **Don't** render images or raw HTML from conversation Markdown
