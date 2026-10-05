import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { version } from "../../../package.json";
import type {
  CalendarResponse,
  HealthResponse,
  ProjectUpdate,
  ServerEvent,
} from "../../shared/api.ts";
import type { EventHub } from "../events.ts";
import { Queries } from "../queries.ts";
import type { Summarizer } from "../summarize/summarizer.ts";
import { guardHost, guardWrite } from "./security.ts";

/** カレンダーで一度に取れる期間の上限（月表示 + 前後の余白）。 */
export const MAX_RANGE_MS = 62 * 24 * 60 * 60_000;
/** プロジェクトの色はパレットのキー（p0〜p7）で持つ。値はテーマごとに Web 側で決まる。 */
const PALETTE_KEY = /^p[0-7]$/;
const KEEPALIVE_MS = 15_000;

export interface AppDeps {
  db: Database;
  events: EventHub;
  summarizer?: Summarizer;
  now?: () => number;
}

export function createApp({ db, events, summarizer, now }: AppDeps): Hono {
  const q = new Queries(db, now, summarizer);
  const app = new Hono();

  app.use("*", guardHost);
  app.on(["POST", "PUT", "PATCH", "DELETE"], "/api/*", guardWrite);

  app.get("/api/health", (c) => c.json<HealthResponse>({ ok: true, name: "kairos", version }));

  app.get("/api/calendar", (c) => {
    const from = Number(c.req.query("from"));
    const to = Number(c.req.query("to"));
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      return c.json({ error: "from と to（ミリ秒、from < to）が必要です" }, 400);
    }
    if (to - from > MAX_RANGE_MS) return c.json({ error: "期間が長すぎます（最大 62 日）" }, 400);
    return c.json<CalendarResponse>({
      from,
      to,
      sessions: q.calendar(from, to),
      projects: q.projects(),
    });
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

  app.get("/api/sessions/:id", (c) => {
    const session = q.session(c.req.param("id"));
    return session ? c.json(session) : c.json({ error: "session not found" }, 404);
  });

  // セクションの要約を作る（作り直す）。結果は SSE の summary.updated で知らせる。
  app.post("/api/sessions/:id/sections/:start/summary", (c) => {
    const id = c.req.param("id");
    const start = Number(c.req.param("start"));
    const section = q.session(id)?.sections.find((s) => s.start === start);
    if (!section) return c.json({ error: "section not found" }, 404);
    if (!summarizer) return c.json({ error: "要約は無効になっています" }, 503);
    summarizer.request(id, start);
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
        // 次のイベントか、接続維持用のコメントを送る時間まで待つ
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
