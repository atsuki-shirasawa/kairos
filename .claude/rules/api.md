---
paths:
  - "src/server/api/**"
  - "src/server/summarize/**"
  - "src/shared/**"
---

# API and summaries

The server returns conversation logs from every project, so assume another site open in the browser and arbitrary text inside the logs are both hostile.

## API (`src/server/api/`)

- Don't loosen API security. `app.ts` applies `guardHost` to every route and `guardWrite` (JSON Content-Type, same Origin) to POST / PUT / PATCH / DELETE under `/api/*`. Register new routes on that app so they inherit both; never mount a route outside it or add CORS headers
- GET routes and SSE have no side effects
- Listen on `127.0.0.1` only
- Don't loosen the CSP in `security.ts`
- Request and response types live in `src/shared/` and are shared with the UI; update both sides together
- Update the API table in `docs/architecture.md` §5 when routes change

## Summaries (`src/server/summarize/`)

- `claude -p` runs in a dedicated empty working directory with `--tools ""`, `--strict-mcp-config`, `--no-session-persistence` and `--setting-sources project`. Keep all of them
- Log text (possible prompt injection) goes in via stdin, never into arguments or a shell
- The output language comes from `--summary-lang <en|ja>` (default `en`); existing summaries are kept and can be regenerated from the drawer

When you change any of this, check with the `security-reviewer` agent.
