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
  muted-ink: "#626b7d"
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
  summary-lead:
    fontFamily: IBM Plex Sans JP
    fontSize: 17px
    fontWeight: 400
    lineHeight: 28px
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
  section-summary-goal:
    textColor: "{colors.ink}"
    typography: "{typography.summary-lead}"
  section-summary:
    textColor: "{colors.ink}"
    typography: "{typography.summary-body}"
  section-summary-done:
    textColor: "{colors.muted-ink}"
    typography: "{typography.body}"
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
  tag:
    textColor: "{colors.muted-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
  status-dot:
    rounded: "{rounded.full}"
    height: 6px
    width: 6px
---

# Kairos Design

Direction **"Indigo hours"**, chosen on 2026-10-05 from three compared proposals
([comparison page](https://claude.ai/artifact/Bgd1XQLQL67RRbRJH36ZaY)).

This file holds the principles, the tokens and the components every screen shares. Each screen's
layout is in [docs/design/screens.md](docs/design/screens.md), and the reasons behind the places a
screen bends a rule are in [docs/design/decisions.md](docs/design/decisions.md).

## Overview

Kairos is the memory of your work: open it to see what is running, what you did last and what is
left to pick up. Looking back is reached from there, and the calendar answers "when". The work
itself is the loudest thing on every screen. Until a home page for this (Today, #55) exists, the app
still opens on the calendar, and the live page holds what is running.

- **What needs you comes first.** A session waiting on you, then what is left open, then what was
  done; numbers (tokens, cost, snags) stay in the background
- **Chronos is the frame, kairos is the mark.** The grid, rules and block heights are clock time
  (chronos), and stay quiet. What the app is named for, the moments that mattered (kairos), is
  drawn on top: each commit and PR is a node on its block's edge at the minute it was made. This
  is the one place the design spends its boldness
- **Keep the frame quiet so the work blocks carry the color.** Toolbar, time column and rules are
  neutral ([plain hour labels](docs/design/decisions.md#hour-labels-stay-plain))
- **One accent.** Indigo (`primary`) means "selected", "focused" or "now". Don't use it for decoration
- **Calm, not dated.** Japanese mineral pigments (iwa-enogu) rather than saturated UI colors
- English UI by default with Japanese available; light and dark themes, following the OS by default

## Colors

Tokens map to CSS variables in `src/web/src/index.css` (shadcn/ui names): `surface` → `--card`,
`ink` → `--foreground`, `muted-ink` → `--muted-foreground`, `line` → `--border`. The dark theme
swaps every value for its `-dark` token under `.dark`.

- **Primary (indigo `#2e4c8c` / `#8da8e8`):** selection (including the selected block's outline),
  the current-time line (and the live band's now mark), focus rings and links. Not for headings or
  surfaces. A list row's trailing link stays `muted-ink` until hovered
  ([why](docs/design/decisions.md#a-list-rows-trailing-link-stays-muted))
- **Background / Surface:** the screen is slightly grey; the calendar body and the drawer sit on
  white (navy in dark) surfaces
- **Warn (`#8a6420`):** text of numbers that need attention (snags), and the few marks that call for you (the asking dot, and on the live page what the
  [screens spec](docs/design/screens.md#live-page) marks `warn`). Plain yellow ocher lacks
  contrast on white, so it is darkened
- **Destructive:** error messages only
- **Input (`#d7dce4` / `#2e3c5a`):** text fields and select borders, where the placeholder and
  the box's own fill also mark the control. An unchecked checkbox has only its outline, so it uses
  `muted-ink` at 80% instead, which keeps it at 3:1 against popovers and surfaces in both themes

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
| Not yet summarized (`--mix-block-dim`) | 9% | 14% |

- `block-base` is achromatic; in CSS it is written with hue `none` (`oklch(1 0 none)`), which the token format can't express, so the mix keeps each project's hue. Mixing into the
  navy card turned ochre and red oxide the same brown
- Dark mixes in more, or the colors turn muddy grey on navy and projects become indistinguishable

## Typography

- **IBM Plex Sans JP** (400 / 500 / 600) for body and UI. It covers both the English and the
  Japanese UI. `palt` is on for the body so Japanese punctuation sits tight. In the English UI only
  the ellipsis "…" comes from a Latin system face, since Plex Sans JP centers it (the Japanese form)
- **IBM Plex Sans Condensed** (500 / 600) with tabular figures for times, dates and numbers — use
  the `font-num` utility. Condensed figures fit narrow day columns and don't jitter as they change
- **Syne SemiBold** only for the "Kairos" wordmark in the header (Latin subset). A face used nowhere
  else, so the name reads as a name rather than a label
- **Four sizes:** 11px (metadata, hour labels, figures), 12px (block headings, labels), 14px
  (body, controls) and 17px (titles: the period heading, day numbers, the drawer title). The only
  exceptions are the section summary's Resolved, Open and Next, its "Settled from earlier", or an
  older body's Outcome (15px, relaxed leading, because that is where you read; its Goal takes the 17px title size at
  regular weight), the
  summary's totals (their three tiers), the live band's two figures (17px medium), the wordmark, count
  badges too small for 11px, and the labels of small toggles and buttons (12.8px, shadcn/ui's
  small size)
- **Sizes are tokens:** `text-meta` (11px), `text-label` (12px), `text-body` (14px), `text-read`
  (15px) and `text-title` (17px), defined in `index.css`'s `@theme`; the exceptions above are
  `text-figure-lg / -md / -sm` (the totals), `text-wordmark`, `text-badge`, and `text-control`
  (the labels of small toggles and buttons). Tailwind's own sizes (`text-xs`, `text-sm`…) are
  switched off, and `bun run check` refuses them and arbitrary sizes like `text-[13px]`. A size
  relative to its line (`text-[0.85em]` for inline code in Markdown) isn't a step of the scale and
  passes
- **Two tones:** `ink` and `muted-ink`. Don't step between them with `text-foreground/80` and the
  like; if something needs to stand out from muted text, set it in `ink`. `muted-ink` at 60% is
  kept for what is absent (the dates of days outside the month, "—" in empty cells). Tooltips invert the theme,
  so there the second tone is 70% opacity. Opacity for states (loading, disabled, faded blocks) is
  not a text tone and is separate

## Layout

- Spacing follows Tailwind's 4px scale; most gaps are 2–8px
- **Weeks start on Sunday**, as on a wall calendar, wherever weeks appear (the week and month views,
  the date picker). Week numbers stay ISO, taken from the week's Monday (the six days
  Monday–Saturday share one)
- Controls, the toolbar and the drawer have one spec each, in
  [screens.md](docs/design/screens.md#toolbar-search-and-filters) and
  [its drawer section](docs/design/screens.md#drawer)

## Elevation & Depth

Few cards and few shadows. Boundaries are 1px `line` rules. Only floating things lift:

- The drawer, when it overlays the screen or floats over it (`shadow-2xl`; where it does is in
  [screens.md](docs/design/screens.md#drawer))
- Popovers and the search results (`shadow-md`)
- The active segment of a segmented toggle (`shadow-sm`)

Stacked work blocks get a 1px `surface`-colored outline, not a shadow, to separate them.

## Shapes

- Base radius is 8px (`--radius`); `sm`/`md`/`lg`/`xl` are 0.6×/0.8×/1×/1.4× of it
- **Work blocks:** a 3px left border in the project color, 3px radius on the left and `md` on the
  right. Blocks continuing from the previous or into the next day drop the radius on that side
- Buttons and toggles use `md`; popovers use `lg`; dots and count badges are `full`

## Components

- **Tag** (`components/ui/tag.tsx`): a small label beside text in a 1px `border` outline with `md`
  radius. `outline` (the default) is 12px `muted-ink`, for the drawer's Headless and the open items'
  kinds; `compact` keeps the size and tone of its line with tighter padding, for the live page's
  Background and Fast. Use it rather than restyling a span, so the badges can't drift apart
- **StatusDot** (`components/ui/status-dot.tsx`): the 6px state dot. `pulse` is work going on now
  (in the project color on the calendar, the table and the live page, `ink` on the Live button,
  `primary` for the drawer's active section), `solid` a state that holds (`warn` for asking,
  `muted-ink` for sessions running), `ring` one that waits or is done (always `muted-ink`)
- **Moment node** (`components/MomentNode.tsx`): the app's word for commit and PR. A commit is a
  7px `ink` ring filled with `surface`, a PR the same node filled with `ink`. Wherever a count or
  list of them appears (day headers, the drawer's figures, Session flow rows, Outcomes, list cells,
  the summary's totals) it uses this node, not icons. The drawer's
  Outcomes list is in time order with the nodes on a thin rule (`ink` at 20%), like the block's edge
- **One frame per thing.** Where a color rule, a surface and a divider would all mark the same
  boundary, keep one. The summary's project recaps sit under the project's colored rule with no
  `muted` box of their own
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
- **Do** mix project colors in `oklch` into `--block-base`; **don't** mix into `--card` or use opacity.
  The live page's cards and rows use no block fill at all
  ([why](docs/design/decisions.md#live-cards-carry-no-block-fill))
- **Do** use `font-num` for any time, date, count or cost
- **Don't** add new accent colors, gradients or decorative shadows to the frame — color belongs to
  the work blocks
- **Don't** add controls to the toolbar; put rarely used settings in the "⋯" menu (the Live button
  is [the one exception](docs/design/decisions.md#the-live-button-is-the-one-toolbar-addition))
- **Don't** hard-code UI copy; it goes in the `en` / `ja` dictionaries (`.claude/rules/web.md`)
- **Don't** render images or raw HTML from conversation Markdown
- **Do** put a new screen's layout in `docs/design/screens.md` and the reason for a new exception
  in `docs/design/decisions.md`; keep this file to what every screen shares
