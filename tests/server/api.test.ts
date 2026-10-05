import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { createApp } from "../../src/server/api/app.ts";
import { EventHub } from "../../src/server/events.ts";
import type {
  CalendarResponse,
  HealthResponse,
  Message,
  MessagesResponse,
  Project,
  SessionDetail,
  SpansResponse,
} from "../../src/shared/api.ts";
import { SID } from "../fixtures/ids.ts";
import { min, setup } from "./ingest/helpers.ts";

let db: Database;
let app: Hono;
let events: EventHub;
let now = min(10_000);

beforeEach(() => {
  const s = setup();
  s.ingester.scan();
  db = s.db;
  events = new EventHub();
  now = min(10_000);
  app = createApp({ db, events, now: () => now });
});

const URL_BASE = "http://127.0.0.1:4319";
const get = (path: string, headers: Record<string, string> = {}) =>
  app.request(`${URL_BASE}${path}`, { headers });
const json = async <T>(path: string) => (await (await get(path)).json()) as T;
const patch = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(`${URL_BASE}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

// 2026-09-28 00:00〜24:00 JST
const DAY_FROM = Date.UTC(2026, 8, 27, 15);
const DAY_TO = DAY_FROM + 24 * 60 * 60_000;

describe("セキュリティ", () => {
  test("ループバック以外の Host は拒否する", async () => {
    expect((await get("/api/health")).status).toBe(200);
    expect((await get("/api/health", { host: "localhost:5173" })).status).toBe(200);
    expect((await get("/api/health", { host: "evil.example" })).status).toBe(400);
  });

  test("全レスポンスに外部読み込みを禁じる CSP を付ける", async () => {
    const csp = (await get("/api/health")).headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("書き込みは JSON のみ、Origin が付いていれば同じホストのみ", async () => {
    expect(
      (await patch("/api/projects/1", "hidden=true", { "content-type": "text/plain" })).status,
    ).toBe(415);
    expect(
      (await patch("/api/projects/1", { hidden: true }, { origin: "https://evil.example" })).status,
    ).toBe(403);
    expect(
      (await patch("/api/projects/1", { hidden: true }, { origin: "http://localhost:5173" }))
        .status,
    ).toBe(200);
  });
});

test("GET /api/health", async () => {
  expect(await json<HealthResponse>("/api/health")).toMatchObject({ ok: true, name: "kairos" });
});

test("GET /api/sessions/:id はセクションごとと、セッション全体の使用量を返す", async () => {
  const s = await json<SessionDetail>(`/api/sessions/${SID.usage}`);
  expect(s.sections.map((x) => x.usage?.tokens)).toEqual([82_700]);
  expect(s.usage).toMatchObject({ tokens: 82_700, model: "claude-opus-5-5", unpriced: false });
  // 続きのセッションは、前のセッションからのコピーを数えない
  const next = await json<SessionDetail>(`/api/sessions/${SID.continuedTo}`);
  expect(next.usage?.tokens).toBe(24_800);
});

describe("作業ブロックの活動", () => {
  const activities = async (id: string) =>
    (await json<SessionDetail>(`/api/sessions/${id}`)).sections.map((x) => x.activity);
  const none = {
    commits: 0,
    prs: 0,
    filesEdited: 0,
    toolCalls: 0,
    subagents: 0,
    toolErrors: 0,
    interrupts: 0,
    apiErrors: 0,
    compactions: 0,
    claudeMs: null,
    effort: null,
  };

  test("1. basic: 成果・編集したファイル・つまずき・Claude の稼働をブロックごとに数える", async () => {
    expect(await activities(SID.basic)).toEqual([
      {
        ...none,
        commits: 2,
        filesEdited: 1,
        toolCalls: 6,
        toolErrors: 1,
        claudeMs: 30_000,
        effort: "high",
      },
      { ...none, prs: 1, toolCalls: 2, interrupts: 1, claudeMs: 30_000, effort: "high" },
    ]);
  });

  test("6. サブエージェント: 起動した数と、サブエージェントのツール呼び出しも数える", async () => {
    const [a] = await activities(SID.subagent);
    expect(a).toMatchObject({ subagents: 1, toolCalls: 2 });
  });

  test("7. compaction: 会話の圧縮を数える", async () => {
    const [, b] = await activities(SID.compaction);
    expect(b?.compactions).toBe(1);
  });

  test("12. usage: effort は出力の多いほう、API エラーとターンの所要時間を数える", async () => {
    const [a] = await activities(SID.usage);
    expect(a).toMatchObject({ effort: "high", apiErrors: 1, claudeMs: 170_000, toolCalls: 1 });
  });

  test("8. 続きのセッション: コピーしたターンは稼働に数えない", async () => {
    const [a] = await activities(SID.continuedTo);
    expect(a?.claudeMs).toBe(30_000);
  });

  test("カレンダーのブロックにも同じ活動を付ける", async () => {
    const res = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    const basic = res.sessions.find((s) => s.id === SID.basic);
    expect(basic?.segments.map((g) => g.activity.commits)).toEqual([2, 0]);
  });
});

describe("GET /api/calendar", () => {
  test("作業ブロックごとに、発言数とトークン使用量（API 料金での換算つき）を返す", async () => {
    const res = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    const [segment] = res.sessions.find((s) => s.id === SID.usage)?.segments ?? [];
    expect(segment?.promptCount).toBe(1);
    expect(segment?.usage).toEqual({
      tokens: 82_700,
      input: 2_500,
      output: 1_200,
      cacheRead: 70_000,
      cacheWrite: 9_000,
      costUsd: expect.closeTo(0.1105, 6),
      unpriced: false,
      model: "claude-opus-5-5",
    });
  });

  test("期間と重なるセッションを返し、人の発言がないセッションは除く", async () => {
    const res = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    const ids = res.sessions.map((s) => s.id);
    expect(ids).toContain(SID.basic);
    expect(ids).toContain(SID.loop);
    expect(ids).not.toContain(SID.headless);
    expect(ids).not.toContain(SID.blog); // 翌日
    // headless のセッションしかないプロジェクト（probe）は絞り込みにも出さない
    expect(res.projects.map((p) => p.name).sort()).toEqual(["app", "blog"]);
  });

  test("空の期間からも移動できるよう、前後のいちばん近い作業ブロックを返す", async () => {
    const day = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    expect(day.prev).toBeNull();
    expect(day.next).toBe(Date.UTC(2026, 8, 29, 1)); // 翌日の blog
    const later = DAY_FROM + 7 * 24 * 60 * 60_000;
    const empty = await json<CalendarResponse>(
      `/api/calendar?from=${later}&to=${later + 24 * 60 * 60_000}`,
    );
    expect(empty).toMatchObject({ sessions: [], prev: Date.UTC(2026, 8, 29, 1), next: null });
  });

  test("作業ブロック・タイトル・ラベルを返す", async () => {
    const res = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    const loop = res.sessions.find((s) => s.id === SID.loop);
    expect(loop?.segments.map((g) => [g.start, g.end])).toEqual([
      [min(0), min(1)],
      [min(150), min(151)],
    ]);
    // 要約がないセクションの見出しは、最初の発言（なければコマンド）の 1 行目
    expect(loop?.segments.map((g) => g.headline)).toEqual(["/loop 30m", "ループ止めて"]);
    expect(res.sessions.find((s) => s.id === SID.basic)?.title).toBe("ログイン機能");
    expect(res.sessions.find((s) => s.id === SID.worktree)?.label).toBe("fix-header");
  });

  test("期間に一部だけ重なる作業ブロックも返す", async () => {
    const res = await json<CalendarResponse>(`/api/calendar?from=${min(4)}&to=${min(46)}`);
    expect(
      res.sessions.find((s) => s.id === SID.basic)?.segments.map((g) => [g.start, g.end]),
    ).toEqual([
      [min(0), min(5)],
      [min(45), min(50.2)],
    ]);
  });

  test("最後の活動から 5 分以内なら active", async () => {
    now = min(151) + 60_000;
    const res = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    expect(res.sessions.find((s) => s.id === SID.loop)?.active).toBe(true);
    expect(res.sessions.find((s) => s.id === SID.basic)?.active).toBe(false);
  });

  test("不正な期間は 400", async () => {
    expect((await get("/api/calendar")).status).toBe(400);
    expect((await get(`/api/calendar?from=${DAY_TO}&to=${DAY_FROM}`)).status).toBe(400);
    expect((await get(`/api/calendar?from=0&to=${DAY_TO}`)).status).toBe(400);
  });
});

describe("GET /api/spans", () => {
  test("カレンダーと同じ作業ブロック（人の発言がないセッションは除く）の時刻を返す", async () => {
    const res = await json<SpansResponse>(`/api/spans?from=${DAY_FROM}&to=${DAY_TO}`);
    const calendar = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    const expected = calendar.sessions
      .flatMap((s) =>
        s.segments.map((g) => ({ start: g.start, end: g.end, projectId: s.projectId })),
      )
      .sort((a, b) => a.start - b.start || a.end - b.end);
    expect(res.spans).toEqual(expected);
  });

  test("不正な期間は 400", async () => {
    expect((await get("/api/spans")).status).toBe(400);
    expect((await get(`/api/spans?from=0&to=${DAY_TO}`)).status).toBe(400);
  });
});

describe("プロジェクト", () => {
  test("色と非表示を変更できる", async () => {
    const [app1] = (await json<Project[]>("/api/projects")).filter((p) => p.name === "app");
    const res = await patch(`/api/projects/${app1?.id}`, { color: "p3", hidden: true });
    expect(await res.json()).toMatchObject({ name: "app", color: "p3", hidden: true });
    expect((await patch(`/api/projects/${app1?.id}`, { color: null })).status).toBe(200);
  });

  test("不正な値は 400、存在しないプロジェクトは 404", async () => {
    expect((await patch("/api/projects/1", { color: "red" })).status).toBe(400);
    expect((await patch("/api/projects/1", { hidden: "yes" })).status).toBe(400);
    expect((await patch("/api/projects/1", {})).status).toBe(400);
    expect((await patch("/api/projects/999", { hidden: true })).status).toBe(404);
  });
});

describe("GET /api/sessions/:id", () => {
  test("詳細: プロジェクト・成果物・振り返り文", async () => {
    const d = await json<SessionDetail>(`/api/sessions/${SID.basic}`);
    expect(d).toMatchObject({
      title: "ログイン機能",
      branch: "feature/login",
      promptCount: 3,
      awaySummary: "ログインフォームを実装して PR #42 を作成した。次はレビュー対応。",
    });
    expect(d.project?.path).toBe("/Users/me/dev/app");
    expect(d.commits.map((c) => c.ref)).toEqual(["1a2b3c4", "9f8e7d6"]);
    expect(d.prs.map((p) => p.title)).toEqual(["#42 me/app"]);
  });

  test("続きのセッションの前後関係とサブエージェント", async () => {
    expect((await json<SessionDetail>(`/api/sessions/${SID.continuedFrom}`)).continuedIn).toBe(
      SID.continuedTo,
    );
    expect((await json<SessionDetail>(`/api/sessions/${SID.continuedTo}`)).continuedFrom).toBe(
      SID.continuedFrom,
    );
    const sub = await json<SessionDetail>(`/api/sessions/${SID.subagent}`);
    expect(sub.subagents).toEqual([
      {
        id: "a1b2c3d4e5f60718",
        agentType: "code-reviewer",
        description: "PR #42 のレビュー",
        toolUseId: "toolu_6666660001",
        startedAt: min(300.6),
        endedAt: min(304.5),
      },
    ]);
  });

  test("セクションごとの要約と、要約のないセクションの見出し", async () => {
    db.query(
      "INSERT INTO summaries VALUES (?, ?, 'ログインフォームの実装', '- 目的: …', 'haiku', ?, ?)",
    ).run(
      SID.basic,
      min(0),
      min(4), // セクションの終わり（5 分）より前までしか含んでいない
      now,
    );
    const d = await json<SessionDetail>(`/api/sessions/${SID.basic}`);
    expect(d.sections.map((x) => [x.start, x.end])).toEqual([
      [min(0), min(5)],
      [min(45), min(50.2)],
    ]);
    expect(d.sections[0]).toMatchObject({
      headline: "ログインフォームの実装",
      body: "- 目的: …",
      stale: true,
      promptCount: 1,
      summarizable: false,
      pending: false,
      error: null,
    });
    expect(d.sections[1]).toMatchObject({
      headline: "PR を作って",
      body: null,
      promptCount: 2,
      summarizable: true,
    });
    const cal = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    expect(
      cal.sessions.find((s) => s.id === SID.basic)?.segments.map((g) => [g.headline, g.summarized]),
    ).toEqual([
      ["ログインフォームの実装", true],
      ["PR を作って", false],
    ]);
  });

  test("要約の依頼: 要約が無効なら 503、セクションがなければ 404", async () => {
    const post = (path: string) =>
      app.request(`${URL_BASE}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    expect((await post(`/api/sessions/${SID.basic}/sections/${min(0)}/summary`)).status).toBe(503);
    expect((await post(`/api/sessions/${SID.basic}/sections/123/summary`)).status).toBe(404);
  });

  test("存在しないセッションは 404", async () => {
    expect((await get("/api/sessions/nope")).status).toBe(404);
    expect((await get("/api/sessions/nope/messages")).status).toBe(404);
  });
});

describe("GET /api/sessions/:id/messages", () => {
  async function all(path: string, limit: number): Promise<Message[]> {
    const out: Message[] = [];
    let cursor: string | null = null;
    do {
      const sep = path.includes("?") ? "&" : "?";
      const page: MessagesResponse = await json(
        `${path}${sep}limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`,
      );
      out.push(...page.messages);
      cursor = page.nextCursor;
    } while (cursor);
    return out;
  }

  test("カーソルで分割して取っても、一度に取った結果と同じ", async () => {
    const whole = (await json<MessagesResponse>(`/api/sessions/${SID.basic}/messages?limit=1000`))
      .messages;
    expect(whole.length).toBeGreaterThan(10);
    expect(await all(`/api/sessions/${SID.basic}/messages`, 3)).toEqual(whole);
    expect(whole[0]).toMatchObject({
      kind: "prompt",
      text: "ログインフォームを実装して。バリデーションも付けてほしい",
    });
    const tool = whole.find((m) => m.kind === "tool_use");
    expect(tool?.toolName).toBe("Bash");
    expect(JSON.parse(tool?.detail ?? "{}")).toMatchObject({ command: "ls src/components" });
  });

  test("前のセッションからのコピーは copies=1 のときだけ含める", async () => {
    const own = await all(`/api/sessions/${SID.continuedTo}/messages`, 100);
    const withCopies = await all(`/api/sessions/${SID.continuedTo}/messages?copies=1`, 100);
    expect(own.some((m) => m.isCopy)).toBe(false);
    expect(withCopies.filter((m) => m.isCopy)).toHaveLength(2);
  });

  test("agent を指定するとサブエージェントの会話", async () => {
    const msgs = await all(`/api/sessions/${SID.subagent}/messages?agent=a1b2c3d4e5f60718`, 100);
    expect(msgs.map((m) => m.kind)).toEqual(["prompt", "tool_use", "tool_result", "assistant"]);
  });
});

test("GET /api/events はイベントを SSE で流す", async () => {
  const controller = new AbortController();
  const res = await app.request(`${URL_BASE}/api/events`, { signal: controller.signal });
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let text = "";
  const readUntil = async (needle: string) => {
    while (!text.includes(needle)) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
  };
  await readUntil("event: ready");
  events.publish({ type: "sessions.updated", ids: [SID.basic] });
  await readUntil(SID.basic);
  expect(text).toContain("event: sessions.updated");
  expect(text).toContain(`"ids":["${SID.basic}"]`);
  controller.abort();
  await reader.cancel();
});
