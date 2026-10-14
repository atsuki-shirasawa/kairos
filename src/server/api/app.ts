import type { Database } from "bun:sqlite";
import { type Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { version } from "../../../package.json";
import type {
  CalendarResponse,
  HealthResponse,
  LedgerEntry,
  LiveResponse,
  OpenItemsResponse,
  OpenItemUpdate,
  ProjectUpdate,
  RecapRequest,
  RecapsResponse,
  SearchResponse,
  ServerEvent,
  Settings,
  SettingsUpdate,
  SpansResponse,
} from "../../shared/api.ts";
import type { EventHub } from "../events.ts";
import { liveSpend } from "../live/cost.ts";
import type { RegistryEntry } from "../live/registry.ts";
import { liveSessions } from "../live/sessions.ts";
import { Queries } from "../queries.ts";
import {
  storedShowHeadless,
  storedSummaryLang,
  storeShowHeadless,
  storeSummaryLang,
} from "../settings.ts";
import { DEFAULT_SUMMARY_LANG, isSummaryLang } from "../summarize/prompt.ts";
import type { Summarizer } from "../summarize/summarizer.ts";
import { DEFAULT_HIDDEN_CWDS } from "../visibility.ts";
import { guardHost, guardWrite } from "./security.ts";

/** Longest range the calendar can fetch at once (a month view plus margins). */
export const MAX_RANGE_MS = 62 * 24 * 60 * 60_000;
/** Project colors are stored as palette keys (p0–p7). The actual colors are set per theme by the web app. */
const PALETTE_KEY = /^p[0-7]$/;
/** How long an idle SSE connection waits before sending a keep-alive comment. */
const KEEPALIVE_MS = 15_000;
/** Shortest search query (in characters) that is run; shorter ones match nearly everything. */
export const MIN_QUERY_CHARS = 2;
/** Longer queries are cut to this many characters. */
const MAX_QUERY_CHARS = 200;

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

  app.get("/api/calendar", (c) => {
    const range = parseRange(c.req.query("from"), c.req.query("to"));
    if ("error" in range) return c.json(range, 400);
    const { from, to } = range;
    return c.json<CalendarResponse>({
      from,
      to,
      sessions: q.calendar(from, to),
      projects: q.projects(),
      ...q.neighbors(from, to),
    });
  });

  app.get("/api/spans", (c) => {
    const range = parseRange(c.req.query("from"), c.req.query("to"));
    if ("error" in range) return c.json(range, 400);
    return c.json<SpansResponse>({ spans: q.spans(range.from, range.to) });
  });

  // Searches every period. Short queries would match nearly everything, so they return nothing
  app.get("/api/search", (c) => {
    const query = (c.req.query("q") ?? "").trim().slice(0, MAX_QUERY_CHARS);
    if ([...query].length < MIN_QUERY_CHARS)
      return c.json<SearchResponse>({ hits: [], more: false });
    return c.json<SearchResponse>(q.search(query));
  });

  app.get("/api/projects", (c) => c.json(q.projects()));

  app.patch("/api/projects/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json<unknown>().catch(() => null);
    const update = parseProjectUpdate(body);
    if (!Number.isInteger(id) || !update) return c.json({ error: "invalid request" }, 400);
    const project = q.updateProject(id, update);
    return project ? c.json(project) : c.json({ error: "project not found" }, 404);
  });

  app.get("/api/settings", (c) => c.json<Settings>(currentSettings(db, summarizer)));

  // The UI sends its language here, so summaries follow it (existing summaries are kept), and
  // whether to show headless sessions
  app.patch("/api/settings", async (c) => {
    const update = parseSettingsUpdate(await c.req.json<unknown>().catch(() => null));
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
    const section = q.session(id)?.sections.find((s) => s.start === start);
    if (!section) return c.json({ error: "section not found" }, 404);
    if (!summarizer) return c.json({ error: "Summaries are disabled" }, 503);
    summarizer.request(id, start);
    return c.json({ queued: true }, 202);
  });

  app.get("/api/recaps", (c) => {
    const range = parseRange(c.req.query("from"), c.req.query("to"));
    if ("error" in range) return c.json(range, 400);
    return c.json<RecapsResponse>({ recaps: q.recaps(range.from, range.to) });
  });

  // Writes (or rewrites) a project's recap of a period. The result is announced via SSE recap.updated.
  app.post("/api/recaps", async (c) => {
    const target = parseRecapRequest(await c.req.json<unknown>().catch(() => null));
    if (!target) return c.json({ error: "invalid request" }, 400);
    if (!q.hasRecapWork(target)) return c.json({ error: "no work to recap" }, 404);
    if (!summarizer) return c.json({ error: "Summaries are disabled" }, 503);
    if (!summarizer.requestRecap(target))
      return c.json({ error: "Too many recaps waiting; try again shortly" }, 429);
    return c.json({ queued: true }, 202);
  });

  app.get("/api/open-items", (c) => {
    const range = parseRange(c.req.query("from"), c.req.query("to"));
    if ("error" in range) return c.json(range, 400);
    return c.json<OpenItemsResponse>({ items: q.openItems(range.from, range.to) });
  });

  // Closes an open item by hand (done or dismissed), or reopens one closed by hand
  app.patch("/api/open-items/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const update = parseOpenItemUpdate(await c.req.json<unknown>().catch(() => null));
    if (!Number.isSafeInteger(id) || !update) return c.json({ error: "invalid request" }, 400);
    const result = q.updateOpenItem(id, update);
    if (result === "not found") return c.json({ error: "open item not found" }, 404);
    if (result === "conflict")
      return c.json({ error: "The item was closed or reopened in the meantime" }, 409);
    return c.json<LedgerEntry>(result);
  });

  app.get("/api/sessions/:id/messages", (c) => {
    const id = c.req.param("id");
    if (!q.session(id)) return c.json({ error: "session not found" }, 404);
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
    const visibility = {
      showHeadless: storedShowHeadless(db),
      hiddenCwds: hiddenCwds ?? DEFAULT_HIDDEN_CWDS,
    };
    const at = (now ?? Date.now)();
    return c.json<LiveResponse>({
      available: live?.available ?? false,
      sessions: live ? liveSessions(db, live.entries(), visibility, at) : [],
      spend: liveSpend(db, visibility, at),
    });
  });

  app.get("/api/events", (c) => streamEvents(c, events));

  return app;
}

/**
 * Streams hub events to one client as SSE until it disconnects, with a keep-alive comment
 * whenever nothing has been sent for `KEEPALIVE_MS`.
 */
function streamEvents(c: Context, events: EventHub): Response {
  return streamSSE(c, async (stream) => {
    const queue: ServerEvent[] = [];
    let wake: (() => void) | null = null;
    /** Resolves true after `KEEPALIVE_MS`, or false as soon as `wake` is called. */
    const idle = () =>
      new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(true), KEEPALIVE_MS);
        wake = () => {
          clearTimeout(timer);
          resolve(false);
        };
      });
    const unsubscribe = events.subscribe((e) => {
      queue.push(e);
      wake?.();
    });
    stream.onAbort(() => {
      unsubscribe();
      wake?.();
    });
    await stream.writeSSE({ event: "ready", data: "{}", retry: 3000 });
    while (!stream.aborted) {
      const next = queue.shift();
      if (next) {
        await stream.writeSSE({ event: next.type, data: JSON.stringify(next) });
        continue;
      }
      const timedOut = await idle();
      wake = null;
      if (timedOut) await stream.write(": keepalive\n\n");
    }
    unsubscribe();
  });
}

/** The settings as they apply now: a language fixed at startup wins over the stored one. */
function currentSettings(db: Database, summarizer: Summarizer | undefined): Settings {
  return {
    summaryLang: summarizer?.lang ?? storedSummaryLang(db) ?? DEFAULT_SUMMARY_LANG,
    summaryLangFixed: summarizer?.langFixed ?? false,
    showHeadless: storedShowHeadless(db),
  };
}

/**
 * Validates a `PATCH /api/settings` body; null unless it changes something, and only validly
 * (a supported language, a boolean).
 */
function parseSettingsUpdate(body: unknown): SettingsUpdate | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const update: SettingsUpdate = {};
  if ("summaryLang" in b) {
    if (!isSummaryLang(b.summaryLang)) return null;
    update.summaryLang = b.summaryLang;
  }
  if ("showHeadless" in b) {
    if (typeof b.showHeadless !== "boolean") return null;
    update.showHeadless = b.showHeadless;
  }
  return Object.keys(update).length ? update : null;
}

/** Validates a `PATCH /api/projects/:id` body; null unless it changes something, and only validly. */
function parseProjectUpdate(body: unknown): ProjectUpdate | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const update: ProjectUpdate = {};
  if ("color" in b) {
    if (b.color !== null && !(typeof b.color === "string" && PALETTE_KEY.test(b.color)))
      return null;
    update.color = b.color as string | null;
  }
  if ("hidden" in b) {
    if (typeof b.hidden !== "boolean") return null;
    update.hidden = b.hidden;
  }
  return Object.keys(update).length ? update : null;
}

/** Validates a `PATCH /api/open-items/:id` body; null unless it names a known state. */
function parseOpenItemUpdate(body: unknown): OpenItemUpdate | null {
  if (typeof body !== "object" || body === null) return null;
  const { state } = body as Record<string, unknown>;
  return state === "done" || state === "dismissed" || state === "open" ? { state } : null;
}

/** Validates a `POST /api/recaps` body; null unless the project id and range are valid. */
function parseRecapRequest(body: unknown): RecapRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { projectId, from, to } = body as Record<string, unknown>;
  if (!Number.isInteger(projectId)) return null;
  const range = parseRange(String(from), String(to));
  if ("error" in range || !Number.isSafeInteger(from) || !Number.isSafeInteger(to)) return null;
  return { projectId: projectId as number, from: range.from, to: range.to };
}

/** Validates the range (ms). Overly long ranges are refused, since they amount to returning everything. */
function parseRange(
  fromParam: string | undefined,
  toParam: string | undefined,
): { from: number; to: number } | { error: string } {
  const from = Number(fromParam);
  const to = Number(toParam);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from)
    return { error: "from and to (ms, from < to) are required" };
  if (to - from > MAX_RANGE_MS) return { error: "Range too long (max 62 days)" };
  return { from, to };
}
