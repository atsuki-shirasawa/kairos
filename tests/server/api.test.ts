import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { createApp } from "../../src/server/api/app.ts";
import { EventHub } from "../../src/server/events.ts";
import type {
  CalendarResponse,
  HealthResponse,
  LiveResponse,
  Message,
  MessagesResponse,
  PrHistory,
  Project,
  SearchResponse,
  SessionDetail,
  SpansResponse,
  Thread,
} from "../../src/shared/api.ts";
import { TOKEN_BUCKET_MS } from "../../src/shared/constants.ts";
import { DAY, HOUR } from "../../src/shared/dates.ts";
import { SID } from "../fixtures/ids.ts";
import { min, setup } from "./ingest/helpers.ts";
import { putSummary } from "./summaryRows.ts";

/** Where the summarizerRun fixture was launched, standing in for Kairos's summarizer directory. */
const SUMMARIZER_CWD = "/Users/me/tmp/scratch/kairos-data/summarizer";

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
  app = createApp({ db, events, now: () => now, hiddenCwds: [SUMMARIZER_CWD] });
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

// 2026-09-28 00:00–24:00 JST
const DAY_FROM = Date.UTC(2026, 8, 27, 15);
const DAY_TO = DAY_FROM + 24 * 60 * 60_000;

describe("security", () => {
  test("rejects a non-loopback Host", async () => {
    expect((await get("/api/health")).status).toBe(200);
    expect((await get("/api/health", { host: "localhost:5173" })).status).toBe(200);
    expect((await get("/api/health", { host: "evil.example" })).status).toBe(400);
  });

  test("adds a CSP forbidding external loads to every response", async () => {
    const csp = (await get("/api/health")).headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("writes accept only JSON, and only the same host when an Origin is present", async () => {
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
  // No summarizer here, so nothing is summarized automatically and `kairos summarize` takes it all
  expect(await json<HealthResponse>("/api/health")).toMatchObject({
    ok: true,
    name: "kairos",
    autoSummary: false,
  });
});

test("GET /api/sessions/:id returns usage per section and for the whole session", async () => {
  const s = await json<SessionDetail>(`/api/sessions/${SID.usage}`);
  expect(s.sections.map((x) => x.usage?.tokens)).toEqual([82_700]);
  expect(s.usage).toMatchObject({ tokens: 82_700, model: "claude-opus-5-5", unpriced: false });
  // A continued session does not count copies from the previous session
  const next = await json<SessionDetail>(`/api/sessions/${SID.continuedTo}`);
  expect(next.usage?.tokens).toBe(24_800);
});

describe("work block activity", () => {
  const activities = async (id: string) =>
    (await json<SessionDetail>(`/api/sessions/${id}`)).sections.map((x) => x.activity);
  const none = {
    commits: 0,
    prs: 0,
    merges: 0,
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

  test("1. basic: counts output, edited files, trouble and Claude time per block", async () => {
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

  test("15. merges: counts merged PRs, which stay out of the drawer's PR list", async () => {
    const [a] = await activities(SID.merges);
    expect(a).toMatchObject({ merges: 3, prs: 0 });
    expect((await json<SessionDetail>(`/api/sessions/${SID.merges}`)).prs).toEqual([]);
  });

  test("6. subagents: counts launches and the subagents' tool calls", async () => {
    const [a] = await activities(SID.subagent);
    expect(a).toMatchObject({ subagents: 1, toolCalls: 2 });
  });

  test("7. compaction: counts compactions", async () => {
    const [, b] = await activities(SID.compaction);
    expect(b?.compactions).toBe(1);
  });

  test("12. usage: effort is the one with more output; counts API errors and turn durations", async () => {
    const [a] = await activities(SID.usage);
    expect(a).toMatchObject({ effort: "high", apiErrors: 1, claudeMs: 170_000, toolCalls: 1 });
  });

  test("8. continued session: copied turns do not count as Claude time", async () => {
    const [a] = await activities(SID.continuedTo);
    expect(a?.claudeMs).toBe(30_000);
  });

  test("attaches the same activity to calendar blocks", async () => {
    const res = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    const basic = res.sessions.find((s) => s.id === SID.basic);
    expect(basic?.segments.map((g) => g.activity.commits)).toEqual([2, 0]);
  });
});

describe("GET /api/search", () => {
  const search = (q: string) => json<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`);

  test("finds the work block a commit or PR belongs to, across periods", async () => {
    const commit = await search("validate email");
    expect(commit.hits).toMatchObject([{ sessionId: SID.basic, field: "commit" }]);
    const pr = await search("pull/42");
    expect(pr.hits).toMatchObject([{ sessionId: SID.basic, field: "pr" }]);
    // The PR is in the second block, the commit in the first
    expect(pr.hits[0]?.start).toBeGreaterThan(commit.hits[0]?.start ?? Infinity);
  });

  test("every term must match, but each may match a different place", async () => {
    expect((await search("validate pull/42")).hits).toEqual([]);
    expect((await search("ログイン validate")).hits.map((h) => h.sessionId)).toEqual([SID.basic]);
  });

  test("ignores queries that are too short, and treats LIKE wildcards literally", async () => {
    expect(await search("a")).toEqual({ hits: [], more: false });
    expect((await search("%_")).hits).toEqual([]);
  });

  test("file: matches only the paths of files edited in the block", async () => {
    const res = await search("file:src/LoginForm");
    expect(res.hits).toMatchObject([{ sessionId: SID.basic, start: min(0), field: "file" }]);
    expect(res.hits[0]?.snippet).toContain("LoginForm.tsx");
    // A plain term doesn't look at file paths, and file: doesn't look anywhere else
    expect((await search("loginform.tsx")).hits).toEqual([]);
    expect((await search("file:validate")).hits).toEqual([]);
    // It combines with plain terms like any other
    expect((await search("ログイン FILE:loginform")).hits.map((h) => h.field)).toEqual([
      "headline",
    ]);
    expect(await search("file:")).toEqual({ hits: [], more: false });
  });

  test("leaves out sessions without user prompts", async () => {
    // The headless session's only reply is "ok"
    const res = await search("ok");
    expect(res.hits.map((h) => h.sessionId)).not.toContain(SID.headless);
  });
});

describe("GET /api/prs", () => {
  test("a PR's title, when it was opened and merged, and the blocks that touched it", async () => {
    const pr = await json<PrHistory>("/api/prs?repo=github.com/me/app&number=42");
    expect(pr).toMatchObject({
      repo: "github.com/me/app",
      number: 42,
      url: "https://github.com/me/app/pull/42",
      openedAt: min(48),
      mergedAt: null,
    });
    expect(pr.blocks.map((b) => [b.sessionId, b.start, b.how])).toEqual([
      [SID.basic, min(45), ["opened"]],
    ]);
  });

  test("a merge joins its PR by the session's repository", async () => {
    const pr = await json<PrHistory>("/api/prs?repo=github.com/me/app&number=46");
    expect(pr.mergedAt).not.toBeNull();
    expect(pr.blocks.map((b) => [b.sessionId, b.how])).toEqual([
      [SID.merges, ["merged", "worked"]],
    ]);
  });

  test("400 for a malformed ref and 404 for a number the logs never name", async () => {
    expect((await get("/api/prs?repo=me/app&number=42")).status).toBe(400);
    expect((await get("/api/prs?repo=github.com/me/app&number=x")).status).toBe(400);
    expect((await get("/api/prs?repo=github.com/me/app&number=99999")).status).toBe(404);
  });

  test("404 for a PR no visible block touched, though hidden work knew it", async () => {
    // Only the headless session's block names #777, and headless sessions are hidden by default
    const block = db
      .query<{ id: number }, [string]>("SELECT id FROM segments WHERE session_id = ? LIMIT 1")
      .get(SID.headless);
    if (!block) throw new Error("the headless fixture has no block");
    db.run(
      `INSERT INTO block_refs (block_id, repo, number, how, ts, title)
       VALUES (?, 'github.com/me/app', 777, 'opened', 1, 'secret')`,
      [block.id],
    );
    expect((await get("/api/prs?repo=github.com/me/app&number=777")).status).toBe(404);
  });
});

describe("threads", () => {
  test("a thread across a continuation shows both sessions, oldest first, with their blocks", async () => {
    const thread = await json<Thread>(`/api/sessions/${SID.continuedTo}/thread`);
    expect(thread.seed).toBe(SID.continuedTo);
    expect(thread.sessions.map((s) => s.id)).toEqual([SID.continuedFrom, SID.continuedTo]);
    expect(thread.sessions.every((s) => s.segments.length > 0)).toBe(true);
    expect(thread.links).toEqual([
      {
        sessionId: SID.continuedFrom,
        from: SID.continuedTo,
        tie: "continued",
        pr: null,
        branch: null,
      },
    ]);
    expect(thread.truncated).toBe(false);
  });

  test("lists the items the thread's blocks left open, closed since or not", async () => {
    const block = db
      .query<{ id: number }, [string]>("SELECT id FROM segments WHERE session_id = ? LIMIT 1")
      .get(SID.continuedFrom);
    if (!block) throw new Error("the continued fixture has no block");
    db.run(
      `INSERT INTO open_items (block_id, opened_at, text, closed_at, closed_by)
       VALUES (?, 1, 'write the docs', NULL, NULL), (?, 2, 'fix the test', 3, 'user')`,
      [block.id, block.id],
    );
    const thread = await json<Thread>(`/api/sessions/${SID.continuedTo}/thread`);
    expect(thread.openItems.map((i) => [i.text, i.closedBy])).toEqual([
      ["write the docs", null],
      ["fix the test", "user"],
    ]);
  });

  test("an item a hidden session closed keeps how, but doesn't link to the hidden block", async () => {
    const block = (sid: string) =>
      db
        .query<{ id: number }, [string]>("SELECT id FROM segments WHERE session_id = ? LIMIT 1")
        .get(sid)?.id;
    db.run(
      `INSERT INTO open_items (block_id, opened_at, text, closed_at, closed_block_id, closed_by)
       VALUES (?, 1, 'left open', 2, ?, 'model')`,
      [block(SID.continuedFrom) ?? -1, block(SID.headless) ?? -1],
    );
    const [item] = (await json<Thread>(`/api/sessions/${SID.continuedTo}/thread`)).openItems;
    expect(item).toMatchObject({ closedBy: "model", closedSessionId: null, closedStart: null });
  });

  test("the drawer counts the session's thread", async () => {
    expect((await json<SessionDetail>(`/api/sessions/${SID.continuedFrom}`)).threadSize).toBe(2);
    expect((await json<SessionDetail>(`/api/sessions/${SID.basic}`)).threadSize).toBe(1);
    expect((await json<SessionDetail>(`/api/sessions/${SID.headless}`)).threadSize).toBe(0);
  });

  test("404 for an unknown or hidden session", async () => {
    expect((await get("/api/sessions/nope/thread")).status).toBe(404);
    expect((await get(`/api/sessions/${SID.headless}/thread`)).status).toBe(404);
  });
});

describe("headless sessions", () => {
  const calendarIds = async () =>
    (await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`)).sessions.map(
      (s) => s.id,
    );
  const showHeadless = async (show: boolean) =>
    expect((await patch("/api/settings", { showHeadless: show })).status).toBe(200);

  test("are hidden until the setting is turned on, then shown flagged as headless", async () => {
    expect(await calendarIds()).not.toContain(SID.headless);
    await showHeadless(true);
    const res = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    const headless = res.sessions.find((s) => s.id === SID.headless);
    expect(headless).toMatchObject({
      headless: true,
      promptCount: 0,
      title: "Run exactly this one Bash command: echo ok",
    });
    expect(res.sessions.find((s) => s.id === SID.basic)?.headless).toBe(false);
    // Their projects join the filter too
    expect((await json<Project[]>("/api/projects")).map((p) => p.name)).toContain("probe");
    await showHeadless(false);
    expect(await calendarIds()).not.toContain(SID.headless);
  });

  test("never include Kairos's own summary runs", async () => {
    await showHeadless(true);
    const ids = await calendarIds();
    expect(ids).toContain(SID.sdkCommand);
    expect(ids).not.toContain(SID.summarizerRun);
    expect((await json<Project[]>("/api/projects")).map((p) => p.name)).not.toContain("summarizer");
  });

  test("are searchable by their SDK input once shown", async () => {
    const search = () => json<SearchResponse>(`/api/search?q=${encodeURIComponent("echo ok")}`);
    expect((await search()).hits.map((h) => h.sessionId)).not.toContain(SID.headless);
    await showHeadless(true);
    expect((await search()).hits).toContainEqual(
      expect.objectContaining({ sessionId: SID.headless, field: "headline" }),
    );
  });

  test("rejects a non-boolean setting", async () => {
    expect((await patch("/api/settings", { showHeadless: "yes" })).status).toBe(400);
    expect((await patch("/api/settings", {})).status).toBe(400);
  });
});

describe("GET /api/calendar", () => {
  test("returns each block's PRs, commits and summary body", async () => {
    const res = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    const basic = res.sessions.find((s) => s.id === SID.basic);
    expect(basic?.segments.map((g) => g.prs.map((a) => a.ref))).toEqual([
      [],
      ["https://github.com/me/app/pull/42"],
    ]);
    // Commits carry their time so the calendar can mark them where they happened
    const commits = basic?.segments.map((g) => g.commits) ?? [];
    expect(commits.map((c) => c.length)).toEqual([2, 0]);
    for (const c of commits[0] ?? []) expect(c.ts).toBeNumber();
    expect(basic?.segments.map((g) => g.body)).toEqual([null, null]);
  });

  test("returns whose turn it was in each block, cut to the block", async () => {
    const res = await json<CalendarResponse>(`/api/calendar?from=${min(1950)}&to=${min(1990)}`);
    const [segment] = res.sessions.find((s) => s.id === SID.turns)?.segments ?? [];
    expect(segment?.turns.map((t) => t.who)).toEqual([
      "claude",
      "you",
      "claude",
      "you",
      "claude",
      "claude",
      "you",
      "claude",
    ]);
    expect(segment?.turns[0]?.start).toBe(segment?.start);
    expect(segment?.turns.at(-1)?.end).toBe(segment?.end);
  });

  test("returns prompt count and token usage (with API-price cost) per work block", async () => {
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

  test("returns sessions overlapping the range, excluding those without user prompts", async () => {
    const res = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    const ids = res.sessions.map((s) => s.id);
    expect(ids).toContain(SID.basic);
    expect(ids).toContain(SID.loop);
    expect(ids).not.toContain(SID.headless);
    expect(ids).not.toContain(SID.blog); // the next day
    // A project with only headless sessions (probe) is left out of the filter too
    expect((await json<Project[]>("/api/projects")).map((p) => p.name).sort()).toEqual([
      "app",
      "blog",
    ]);
  });

  test("returns the nearest work blocks before and after, so an empty range can jump", async () => {
    const day = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    expect(day.prev).toBeNull();
    expect(day.next).toBe(Date.UTC(2026, 8, 29, 1)); // blog on the next day
    const later = DAY_FROM + 7 * 24 * 60 * 60_000;
    const empty = await json<CalendarResponse>(
      `/api/calendar?from=${later}&to=${later + 24 * 60 * 60_000}`,
    );
    // The last work block is the turns scenario's, at 1960 min
    expect(empty).toMatchObject({ sessions: [], prev: Date.UTC(2026, 8, 29, 8, 40), next: null });
  });

  test("returns work blocks, titles and labels", async () => {
    const res = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    const loop = res.sessions.find((s) => s.id === SID.loop);
    expect(loop?.segments.map((g) => [g.start, g.end])).toEqual([
      [min(0), min(1)],
      [min(150), min(151)],
    ]);
    // Without a summary, a section's headline is the first line of the first prompt (or command)
    expect(loop?.segments.map((g) => g.headline)).toEqual(["/loop 30m", "ループ止めて"]);
    expect(res.sessions.find((s) => s.id === SID.basic)?.title).toBe("ログイン機能");
    expect(res.sessions.find((s) => s.id === SID.worktree)?.label).toBe("fix-header");
  });

  test("returns what the filter narrows by: branch, automatic runs, continuation", async () => {
    const res = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    const of = (id: string) => res.sessions.find((s) => s.id === id);
    expect(of(SID.basic)).toMatchObject({ branch: "feature/login", continued: false });
    expect(of(SID.loop)?.scheduledRuns).toBe(4);
    // Both ends of a continuation count
    expect(of(SID.continuedFrom)?.continued).toBe(true);
    expect(of(SID.continuedTo)?.continued).toBe(true);
  });

  test("also returns work blocks that only partly overlap the range", async () => {
    const res = await json<CalendarResponse>(`/api/calendar?from=${min(4)}&to=${min(46)}`);
    expect(
      res.sessions.find((s) => s.id === SID.basic)?.segments.map((g) => [g.start, g.end]),
    ).toEqual([
      [min(0), min(5)],
      [min(45), min(50.2)],
    ]);
  });

  test("active within 5 minutes of the last activity", async () => {
    now = min(151) + 60_000;
    const res = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    expect(res.sessions.find((s) => s.id === SID.loop)?.active).toBe(true);
    expect(res.sessions.find((s) => s.id === SID.basic)?.active).toBe(false);
  });

  test("invalid range is 400", async () => {
    expect((await get("/api/calendar")).status).toBe(400);
    expect((await get(`/api/calendar?from=${DAY_TO}&to=${DAY_FROM}`)).status).toBe(400);
    expect((await get(`/api/calendar?from=0&to=${DAY_TO}`)).status).toBe(400);
  });
});

describe("GET /api/spans", () => {
  test("returns the times of the same work blocks as the calendar (excluding sessions without prompts)", async () => {
    const res = await json<SpansResponse>(`/api/spans?from=${DAY_FROM}&to=${DAY_TO}`);
    const calendar = await json<CalendarResponse>(`/api/calendar?from=${DAY_FROM}&to=${DAY_TO}`);
    const expected = calendar.sessions
      .flatMap((s) =>
        s.segments.map((g) => ({ start: g.start, end: g.end, projectId: s.projectId })),
      )
      .sort((a, b) => a.start - b.start || a.end - b.end);
    expect(res.spans).toEqual(expected);
  });

  test("invalid range is 400", async () => {
    expect((await get("/api/spans")).status).toBe(400);
    expect((await get(`/api/spans?from=0&to=${DAY_TO}`)).status).toBe(400);
  });
});

describe("projects", () => {
  test("can change color and hidden", async () => {
    const [app1] = (await json<Project[]>("/api/projects")).filter((p) => p.name === "app");
    const res = await patch(`/api/projects/${app1?.id}`, { color: "p3", hidden: true });
    expect(await res.json()).toMatchObject({ name: "app", color: "p3", hidden: true });
    expect((await patch(`/api/projects/${app1?.id}`, { color: null })).status).toBe(200);
  });

  test("invalid values are 400, unknown projects 404", async () => {
    expect((await patch("/api/projects/1", { color: "red" })).status).toBe(400);
    expect((await patch("/api/projects/1", { hidden: "yes" })).status).toBe(400);
    expect((await patch("/api/projects/1", {})).status).toBe(400);
    expect((await patch("/api/projects/999", { hidden: true })).status).toBe(404);
  });
});

describe("GET /api/sessions/:id", () => {
  test("detail: project, artifacts, recap", async () => {
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

  test("continued-session links and subagents", async () => {
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

  test("a summary that read past its section's end (a topic split cut it short) is stale", async () => {
    putSummary(db, SID.basic, min(45), {
      headline: "PR とその次",
      body: "- 目的: …",
      model: "haiku",
      coveredUntil: min(80),
      createdAt: now,
    });
    const d = await json<SessionDetail>(`/api/sessions/${SID.basic}`);
    expect(d.sections[1]).toMatchObject({ headline: "PR とその次", stale: true });
  });

  test("per-section summaries, and headlines of sections without one", async () => {
    putSummary(db, SID.basic, min(0), {
      headline: "ログインフォームの実装",
      body: "- 目的: …",
      model: "haiku",
      coveredUntil: min(4), // covers only up to before the section end (5 minutes)
      createdAt: now,
    });
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

  test("summary request: 503 when summaries are disabled, 404 without the section", async () => {
    const post = (path: string) =>
      app.request(`${URL_BASE}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    expect((await post(`/api/sessions/${SID.basic}/sections/${min(0)}/summary`)).status).toBe(503);
    expect((await post(`/api/sessions/${SID.basic}/sections/123/summary`)).status).toBe(404);
  });

  test("unknown session is 404", async () => {
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

  test("fetching in pages with a cursor gives the same result as fetching at once", async () => {
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

  test("leaves out Claude Code's notes (compact summaries and recaps)", async () => {
    for (const id of [SID.basic, SID.compaction]) {
      const kinds = (await all(`/api/sessions/${id}/messages`, 100)).map((m) => m.kind as string);
      expect(kinds).not.toContain("away_summary");
      expect(kinds).not.toContain("compact_summary");
    }
  });

  test("includes copies from the previous session only with copies=1", async () => {
    const own = await all(`/api/sessions/${SID.continuedTo}/messages`, 100);
    const withCopies = await all(`/api/sessions/${SID.continuedTo}/messages?copies=1`, 100);
    expect(own.some((m) => m.isCopy)).toBe(false);
    expect(withCopies.filter((m) => m.isCopy)).toHaveLength(2);
  });

  test("with agent, returns the subagent's conversation", async () => {
    const msgs = await all(`/api/sessions/${SID.subagent}/messages?agent=a1b2c3d4e5f60718`, 100);
    expect(msgs.map((m) => m.kind)).toEqual(["prompt", "tool_use", "tool_result", "assistant"]);
  });
});

test("GET /api/events streams events over SSE", async () => {
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
  events.publish({ type: "sessions.updated", ids: [SID.basic], from: 0, to: 1 });
  await readUntil(SID.basic);
  expect(text).toContain("event: sessions.updated");
  expect(text).toContain(`"ids":["${SID.basic}"]`);
  controller.abort();
  await reader.cancel();
});

describe("GET /api/live", () => {
  test("is unavailable when running sessions aren't followed", async () => {
    const res = await json<LiveResponse>("/api/live");
    expect(res).toMatchObject({ available: false, sessions: [] });
    // Tokens are the logs' and don't need the registry
    // From midnight up to now in 5-minute buckets
    expect(res.tokens.buckets.length * TOKEN_BUCKET_MS).toBeGreaterThanOrEqual(
      res.tokens.to - res.tokens.from,
    );
    expect(res.tokens.buckets.length).toBeLessThanOrEqual(DAY / TOKEN_BUCKET_MS + 12);
  });

  test("lists the running sessions the calendar would show", async () => {
    const running = (sessionId: string, cwd: string) => ({
      pid: 1,
      sessionId,
      cwd,
      kind: "interactive",
      status: "busy",
      statusUpdatedAt: now,
      startedAt: now,
      procStart: null,
      name: null,
    });
    app = createApp({
      db,
      events,
      now: () => now,
      hiddenCwds: [SUMMARIZER_CWD],
      live: {
        available: true,
        entries: () => [
          running(SID.basic, "/Users/me/dev/app"),
          running(SID.summarizerRun, SUMMARIZER_CWD),
        ],
      },
    });
    const body = await json<LiveResponse>("/api/live");
    expect(body.available).toBe(true);
    expect(body.sessions.map((s) => [s.id, s.state])).toEqual([[SID.basic, "working"]]);
  });
  test("has no plan limits until any are recorded", async () => {
    expect((await json<LiveResponse>("/api/live")).limits).toBeNull();
  });

  test("passes on the plan limits as last recorded", async () => {
    const limits = {
      fiveHour: { usedPercent: 23.5, resetsAt: now + HOUR },
      sevenDay: null,
      seenAt: now,
    };
    app = createApp({ db, events, now: () => now, planLimits: () => limits });
    expect((await json<LiveResponse>("/api/live")).limits).toEqual(limits);
  });
});
