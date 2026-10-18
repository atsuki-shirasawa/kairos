import type { Database } from "bun:sqlite";
import { type Context, Hono } from "hono";
import { version } from "../../../package.json";
import type {
  CalendarResponse,
  HealthResponse,
  LedgerEntry,
  LiveResponse,
  OpenItemsResponse,
  PickUpResponse,
  PrHistory,
  RecapsResponse,
  SearchResponse,
  Settings,
  SpansResponse,
} from "../../shared/api.ts";
import { DEFAULT_SUMMARY_LANG } from "../../shared/summaryLang.ts";
import type { EventHub } from "../events.ts";
import type { RegistryEntry } from "../live/registry.ts";
import { liveSessions } from "../live/sessions.ts";
import { liveTokens } from "../live/usage.ts";
import { Queries } from "../queries/index.ts";
import {
  storedShowHeadless,
  storedSummaryLang,
  storeShowHeadless,
  storeSummaryLang,
} from "../settings.ts";
import type { Summarizer } from "../summarize/summarizer.ts";
import { currentVisibility } from "../visibility.ts";
import { guardHost, guardWrite } from "./security.ts";
import { streamEvents } from "./sse.ts";
import {
  parseOpenItemUpdate,
  parseProjectUpdate,
  parsePrRef,
  parseRange,
  parseRecapRequest,
  parseSearchQuery,
  parseSettingsUpdate,
  type Range,
} from "./validate.ts";

/** The running Claude Code sessions (answered by `LiveTracker`). */
export interface LiveSource {
  entries(): readonly RegistryEntry[];
  readonly available: boolean;
}

/**
 * Dependencies of the API. `summarizer` is absent when summaries are off, and `live` when running
 * sessions aren't followed; `now` and `hiddenCwds` (launch directories never shown, by default
 * Kairos's own summarizer directory) are for tests.
 */
export interface AppDeps {
  db: Database;
  events: EventHub;
  summarizer?: Summarizer;
  live?: LiveSource;
  now?: () => number;
  hiddenCwds?: readonly string[];
}

/** Builds the Hono app: Host and write guards first, then the JSON API and the SSE stream. */
export function createApp({ db, events, summarizer, live, now, hiddenCwds }: AppDeps): Hono {
  const q = new Queries(db, now, summarizer, hiddenCwds);
  const app = new Hono();

  app.use("*", guardHost);
  app.on(["POST", "PUT", "PATCH", "DELETE"], "/api/*", guardWrite);

  app.get("/api/health", (c) =>
    c.json<HealthResponse>({
      ok: true,
      name: "kairos",
      version,
      autoSummary: summarizer?.auto ?? false,
    }),
  );

  app.get("/api/calendar", (c) =>
    withRange(c, ({ from, to }) =>
      c.json<CalendarResponse>({
        from,
        to,
        sessions: q.calendar(from, to),
        ...q.neighbors(from, to),
      }),
    ),
  );

  app.get("/api/spans", (c) =>
    withRange(c, ({ from, to }) => c.json<SpansResponse>({ spans: q.spans(from, to) })),
  );

  // Searches every period. Short queries would match nearly everything, so they return nothing
  app.get("/api/search", (c) => {
    const query = parseSearchQuery(c.req.query("q"));
    if (query === null) return c.json<SearchResponse>({ hits: [], more: false });
    return c.json<SearchResponse>(q.search(query));
  });

  app.get("/api/prs", (c) => {
    const ref = parsePrRef(c.req.query("repo"), c.req.query("number"));
    if (!ref) return c.json({ error: "invalid request" }, 400);
    const pr = q.pr(ref);
    return pr ? c.json<PrHistory>(pr) : c.json({ error: "PR not found" }, 404);
  });

  app.get("/api/projects", (c) => c.json(q.projects()));

  app.patch("/api/projects/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const update = parseProjectUpdate(await readJson(c));
    if (!Number.isInteger(id) || !update) return c.json({ error: "invalid request" }, 400);
    const project = q.updateProject(id, update);
    return project ? c.json(project) : c.json({ error: "project not found" }, 404);
  });

  app.get("/api/settings", (c) => c.json<Settings>(currentSettings(db, summarizer)));

  // The UI sends its language here, so summaries follow it (existing summaries are kept), and
  // whether to show headless sessions
  app.patch("/api/settings", async (c) => {
    const update = parseSettingsUpdate(await readJson(c));
    if (!update) return c.json({ error: "invalid request" }, 400);
    if (update.summaryLang) storeSummaryLang(db, update.summaryLang);
    if (update.showHeadless !== undefined) storeShowHeadless(db, update.showHeadless);
    return c.json<Settings>(currentSettings(db, summarizer));
  });

  app.get("/api/sessions/:id", (c) => {
    const session = q.session(c.req.param("id"));
    return session ? c.json(session) : c.json({ error: "session not found" }, 404);
  });

  // Generates (or regenerates) a section summary. The result is announced via SSE summary.updated.
  app.post("/api/sessions/:id/sections/:start/summary", (c) => {
    const id = c.req.param("id");
    const start = Number(c.req.param("start"));
    if (!q.hasSection(id, start)) return c.json({ error: "section not found" }, 404);
    if (!summarizer) return c.json({ error: "Summaries are disabled" }, 503);
    summarizer.request(id, start);
    return c.json({ queued: true }, 202);
  });

  app.get("/api/recaps", (c) =>
    withRange(c, ({ from, to }) => c.json<RecapsResponse>({ recaps: q.recaps(from, to) })),
  );

  // Writes (or rewrites) a project's recap of a period. The result is announced via SSE recap.updated.
  app.post("/api/recaps", async (c) => {
    const target = parseRecapRequest(await readJson(c));
    if (!target) return c.json({ error: "invalid request" }, 400);
    if (!q.hasRecapWork(target)) return c.json({ error: "no work to recap" }, 404);
    if (!summarizer) return c.json({ error: "Summaries are disabled" }, 503);
    if (!summarizer.requestRecap(target))
      return c.json({ error: "Too many recaps waiting; try again shortly" }, 429);
    return c.json({ queued: true }, 202);
  });

  app.get("/api/open-items", (c) =>
    withRange(c, ({ from, to }) => c.json<OpenItemsResponse>({ items: q.openItems(from, to) })),
  );

  // What is left to pick up now: no period, ranked and capped by the page
  app.get("/api/pick-up", (c) => c.json<PickUpResponse>({ sessions: q.pickUp() }));

  // Closes an open item by hand (done, dismissed or mistaken), or reopens one closed by hand,
  // logging the decision
  app.patch("/api/open-items/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const update = parseOpenItemUpdate(await readJson(c));
    if (!Number.isSafeInteger(id) || !update) return c.json({ error: "invalid request" }, 400);
    const result = q.updateOpenItem(id, update);
    if (result === "not found") return c.json({ error: "open item not found" }, 404);
    if (result === "conflict")
      return c.json({ error: "The item was closed or reopened in the meantime" }, 409);
    return c.json<LedgerEntry>(result);
  });

  app.get("/api/sessions/:id/messages", (c) => {
    const id = c.req.param("id");
    if (!q.hasSession(id)) return c.json({ error: "session not found" }, 404);
    const limit = Number(c.req.query("limit") ?? Number.NaN);
    return c.json(
      q.messages(id, {
        agent: c.req.query("agent") ?? null,
        cursor: c.req.query("cursor") ?? null,
        ...(Number.isFinite(limit) ? { limit } : {}),
        copies: c.req.query("copies") === "1",
      }),
    );
  });

  // Running sessions. Changes are announced via SSE live.updated (and sessions.updated for the log)
  app.get("/api/live", (c) => {
    const visibility = currentVisibility(db, hiddenCwds);
    const at = (now ?? Date.now)();
    return c.json<LiveResponse>({
      available: live?.available ?? false,
      sessions: live ? liveSessions(db, live.entries(), visibility, at) : [],
      tokens: liveTokens(db, visibility, at),
    });
  });

  app.get("/api/events", (c) => streamEvents(c, events));

  return app;
}

/** The settings as they apply now: a language fixed at startup wins over the stored one. */
function currentSettings(db: Database, summarizer: Summarizer | undefined): Settings {
  return {
    summaryLang: summarizer?.lang ?? storedSummaryLang(db) ?? DEFAULT_SUMMARY_LANG,
    summaryLangFixed: summarizer?.langFixed ?? false,
    showHeadless: storedShowHeadless(db),
  };
}

/** Runs `handle` with the validated `?from=&to=` period, or answers 400 with why it was refused. */
function withRange(c: Context, handle: (range: Range) => Response): Response {
  const range = parseRange(c.req.query("from"), c.req.query("to"));
  return "error" in range ? c.json(range, 400) : handle(range);
}

/** The request's JSON body, or null when it isn't valid JSON (the validators then refuse it). */
function readJson(c: Context): Promise<unknown> {
  return c.req.json<unknown>().catch(() => null);
}
