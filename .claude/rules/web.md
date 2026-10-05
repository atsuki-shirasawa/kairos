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

- shadcn/ui primitives live in `src/web/src/components/ui/`; add new ones there rather than styling Radix directly in feature components
- Tailwind v4 (CSS-first config in `src/web/src/index.css`, no `tailwind.config.js`). Check the latest docs with context7
- Keyboard shortcuts are mapped in `lib/shortcuts.ts`, handled in `hooks/useKeyboardShortcuts.ts` and listed in the "⋯" menu (`components/toolbar/AppMenu.tsx`); keep both in sync
- To see a change in the browser, use `/verify-ui` (runs against the fixtures)
