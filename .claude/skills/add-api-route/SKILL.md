---
name: add-api-route
description: Adds or changes an HTTP API route end to end — the Hono handler, shared types, the query, the UI client, ARCHITECTURE.md's API table and tests — keeping the Host and write guards in force. Use when the UI needs new data or a new action from the server.
---

# Add an API route

The server returns conversation logs from every project, so every route must stay behind the guards in `src/server/api/app.ts`: `guardHost` on everything and `guardWrite` (JSON Content-Type, same Origin) on POST / PUT / PATCH / DELETE under `/api/*`. Read `.claude/rules/api.md` first.

## Steps

1. **Types** (`src/shared/api.ts`): the response type, and a request type for writes (`XxxUpdate` / `XxxRequest`, like `ProjectUpdate`). Each export gets a JSDoc; fields that need explaining get one too
2. **Query** (`src/server/queries.ts`): a method on `Queries` that returns the shared type. Placeholders only, never SQL built from request values. If the query needs a new index, that's a migration: `/add-migration`
3. **Route** (`src/server/api/app.ts`): register it inside `createApp`, next to its neighbors, so it inherits both guards. Never mount a route on another app or add CORS headers
   - Path under `/api/`, `c.json<Type>(...)` with the shared type
   - Validate input in a `parseXxx(body: unknown)` function at the bottom of the file (like `parseProjectUpdate`), and periods with `parseRange`. Bad input → 400 `{ error }`, missing thing → 404
   - GET has no side effects. A write that changes what the UI shows publishes on `events` (add the variant to `ServerEvent` in `src/shared/api.ts`) so open tabs refresh over SSE
   - Anything that runs `claude -p` goes through the summarizer queue, never directly from the handler
4. **Client** (`src/web/src/lib/api.ts`): one method on `api` using `request` / `query`; a write passes `method`, `content-type: application/json` and a JSON body. Add a TanStack Query hook in `src/web/src/hooks/queries.ts` when components read it, and invalidate the affected keys after a write
5. **Docs**: add or update the row in the API table in `ARCHITECTURE.md` §5 (method, path with query params, what it returns, status codes other than 200)
6. **Tests** (`tests/server/api.test.ts`, built on the fixtures via `setup()`):
   - The happy path against fixture data, typed with the shared response type
   - 400 for bad input and 404 for a missing ID
   - For a write route: rejected without `content-type: application/json` and with a foreign `Origin` (copy the existing `security` cases)
7. **Verify**: `bun run check`, then run the `security-reviewer` agent (the Stop hook asks for it too). If the UI changed, `/verify-ui`

## Report when done

- The route, its request and response types, and its status codes
- How it's protected (inherited guards; write routes' events)
- Whether the UI uses it yet
