---
paths:
  - "src/web/**"
---

# Web UI

## UI copy (i18n)

- Never hard-code UI copy in components. Add it to the area's dictionary in `src/web/src/i18n/messages/<area>.ts` with `defineMessages`, in both `en` and `ja`; a new area gets its own file
- English is the source of truth. Japanese must have the same shape (a missing key is a type error) and say the same thing, including interpolation functions
- Call the message function at render time or inside a helper, never at module level: the locale would freeze at load time
- Dates, numbers and costs go through the helpers in `src/web/src/lib/dates.ts` / `format.ts`, not ad-hoc `toLocaleString()` or concatenation
- After changing components or dictionaries, check with the `i18n-reviewer` agent

## Conversation Markdown

Log text is untrusted (it may contain text copied from web pages). `src/web/src/components/Markdown.tsx` renders it with `react-markdown` defaults: no raw HTML (`rehype-raw`), no `dangerouslySetInnerHTML`, no loading images. Don't relax this; if you must change it, check with the `security-reviewer` agent.

## Components

- Visual design (colors, type, spacing, shared components, do's and don'ts) is in `DESIGN.md` at the repository root; each screen's layout is in `docs/design/screens.md`, and the reason for each exception in `docs/design/decisions.md`. Read them before changing how things look, and update them together with `index.css`. Check it with `npx @google/design.md lint DESIGN.md`, and review the change with the `design-reviewer` agent
- A screen's parts live in its folder under `src/web/src/features/` (`today`, `journal`, `calendar`, `insights`, `table`, `drawer`, `search`, `palette`) and import each other by `./`. A feature doesn't import another feature: a part two features use moves to `components/`, and a pure function to `lib/`. `components/` holds those shared parts and the app shell (`App`'s toolbar, filters and layout body)
- shadcn/ui primitives live in `src/web/src/components/ui/`; add new ones there rather than styling Radix directly in feature components
- Tailwind v4 (CSS-first config in `src/web/src/index.css`, no `tailwind.config.js`). Check the latest docs with context7
- Keyboard shortcuts are mapped in `lib/shortcuts.ts` and handled in `hooks/useKeyboardShortcuts.ts`. The "⋯" menu's list, the key hints in tooltips and the palette's key caps are derived from `SHORTCUT_GROUPS` / `keyCap` there, so add a new shortcut to the map and its group rather than to the menu. A toolbar action goes in the palette too (`lib/palette.ts`); one with a key is a `shortcut` action there, so it runs as the key does
- To see a change in the browser, use `/verify-ui` (runs against the fixtures)
- When the UI changes visibly, retake the docs screenshots with `bun run build && bun run screenshots` (a fictional week in `scripts/screenshots/demo.ts`)
- `bun run visual` compares every view with the local baseline (`/land` runs it). A structural change (moves, renames, routing) must give a zero diff, so land it apart from a visual one; after a visual change, look at `.visual/diff` before `bun run visual --update`
- `bun run e2e` drives the UI by role and name (`tests/e2e/`, `/land` runs it too). When a change renames a control or moves a key, update the test's expectation, not its way of finding things; a new axe violation is fixed, not added to `tests/e2e/axe-baseline.json`
