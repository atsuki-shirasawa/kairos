import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { version } from "../../../package.json";
import type {
  CalendarResponse,
  HealthResponse,
  ProjectUpdate,
  RecapRequest,
  RecapsResponse,
  SearchResponse,
  ServerEvent,
  Settings,
  SpansResponse,
} from "../../shared/api.ts";
import type { EventHub } from "../events.ts";
import { Queries } from "../queries.ts";
import { storedSummaryLang, storeSummaryLang } from "../settings.ts";
import { DEFAULT_SUMMARY_LANG, isSummaryLang } from "../summarize/prompt.ts";
import type { Summarizer } from "../summarize/summarizer.ts";
import { guardHost, guardWrite } from "./security.ts";

/** Longest range the calendar can fetch at once (a month view plus margins). */
export const MAX_RANGE_MS = 62 * 24 * 60 * 60_000;
/** Project colors are stored as palette keys (p0–p7). The actual colors are set per theme by the web app. */
const PALETTE_KEY = /^p[0-7]$/;
const KEEPALIVE_MS = 15_000;
/** Shortest search query (in characters) that is run; shorter ones match nearly everything. */
export const MIN_QUERY_CHARS = 2;
const MAX_QUERY_CHARS = 200;

/** Dependencies of the API. `summarizer` is absent when summaries are off; `now` is for tests. */
export interface AppDeps {
  db: Database;
  events: EventHub;
  summarizer?: Summarizer;
  now?: () => number;
}

/** Builds the Hono app: Host and write guards first, then the JSON API and the SSE stream. */
export function createApp({ db, events, summarizer, now }: AppDeps): Hono {
  const q = new Queries(db, now, summarizer);
  const app = new Hono();

  app.use("*", guardHost);
  app.on(["POST", "PUT", "PATCH", "DELETE"], "/api/*", guardWrite);

  app.get("/api/health", (c) => c.json<HealthResponse>({ ok: true, name: "kairos", version }));

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

  const settings = (): Settings => ({
    summaryLang: summarizer?.lang ?? storedSummaryLang(db) ?? DEFAULT_SUMMARY_LANG,
    summaryLangFixed: summarizer?.langFixed ?? false,
  });

  app.get("/api/settings", (c) => c.json<Settings>(settings()));

  // The UI sends its language here, so summaries follow it. Existing summaries are kept
  app.patch("/api/settings", async (c) => {
    const body = await c.req.json<unknown>().catch(() => null);
    const lang =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).summaryLang
        : undefined;
    if (!isSummaryLang(lang)) return c.json({ error: "invalid request" }, 400);
    storeSummaryLang(db, lang);
    return c.json<Settings>(settings());
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

  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const queue: ServerEvent[] = [];
      let wake: (() => void) | null = null;
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
        // Wait for the next event or until it is time to send a keep-alive comment
        const timedOut = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(true), KEEPALIVE_MS);
          wake = () => {
            clearTimeout(timer);
            resolve(false);
          };
        });
        wake = null;
        if (timedOut) await stream.write(": keepalive\n\n");
      }
      unsubscribe();
    }),
  );

  return app;
}

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
