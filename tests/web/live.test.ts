import { describe, expect, test } from "bun:test";
import type { LiveSession, Project } from "../../src/shared/api.ts";
import {
  attentionCount,
  cacheState,
  columnOf,
  contextShare,
  dirName,
  documentTitle,
  IDLE_AFTER_MS,
  liveDisplay,
  spendBars,
  toolLabel,
  visibleLive,
} from "../../src/web/src/lib/live.ts";

const NOW = 1_000_000_000;

function live(id: string, over: Partial<LiveSession> = {}): LiveSession {
  return {
    id,
    pid: 1,
    name: null,
    background: false,
    cwd: "/Users/me/dev/app",
    projectId: null,
    label: null,
    branch: null,
    title: id,
    state: "waiting",
    since: NOW,
    startedAt: 0,
    section: null,
    tool: null,
    question: null,
    contextTokens: null,
    usage: null,
    tasks: null,
    test: null,
    recap: null,
    ...over,
  };
}

const project = (id: number, hidden: boolean): Project => ({
  id,
  path: `/p${id}`,
  name: `p${id}`,
  repo: null,
  color: null,
  hidden,
});

describe("liveDisplay", () => {
  test("a long wait for a prompt turns idle; other states don't", () => {
    expect(liveDisplay({ state: "waiting", since: NOW - IDLE_AFTER_MS + 1 }, NOW)).toBe("waiting");
    expect(liveDisplay({ state: "waiting", since: NOW - IDLE_AFTER_MS }, NOW)).toBe("idle");
    expect(liveDisplay({ state: "asking", since: 0 }, NOW)).toBe("asking");
    expect(liveDisplay({ state: "working", since: 0 }, NOW)).toBe("working");
  });
});

describe("visibleLive", () => {
  test("puts what wants an answer first and idle sessions last, newest change first", () => {
    const sessions = [
      live("idle", { since: 0 }),
      live("working", { state: "working", since: NOW - 1 }),
      live("waiting-old", { since: NOW - 60_000 }),
      live("asking", { state: "asking", since: 0 }),
      live("waiting-new", { since: NOW }),
    ];
    expect(visibleLive(sessions, new Map(), NOW).map((s) => s.id)).toEqual([
      "asking",
      "waiting-new",
      "waiting-old",
      "working",
      "idle",
    ]);
  });

  test("leaves out sessions of hidden projects, like the calendar", () => {
    const projects = new Map([
      [1, project(1, true)],
      [2, project(2, false)],
    ]);
    const sessions = [live("a", { projectId: 1 }), live("b", { projectId: 2 }), live("c")];
    expect(visibleLive(sessions, projects, NOW).map((s) => s.id)).toEqual(["b", "c"]);
  });
});

test("counts asking and waiting sessions for the tab title", () => {
  const sessions = [
    live("asking", { state: "asking" }),
    live("waiting"),
    live("idle", { since: 0 }),
    live("working", { state: "working" }),
  ];
  expect(attentionCount(sessions, NOW)).toBe(2);
  expect(documentTitle(2)).toBe("(2) Kairos");
  expect(documentTitle(0)).toBe("Kairos");
});

test("names a session by its directory before it is ingested", () => {
  expect(dirName("/Users/me/dev/app/")).toBe("app");
  expect(dirName("/")).toBe("/");
});

test("puts asking and waiting together in the column that wants you", () => {
  expect(columnOf("asking")).toBe("attention");
  expect(columnOf("waiting")).toBe("attention");
  expect(columnOf("working")).toBe("working");
  expect(columnOf("idle")).toBe("idle");
});

test("names an MCP tool by its server and tool, and leaves other tools as they are", () => {
  expect(toolLabel("mcp__claude-in-chrome__computer")).toBe("claude-in-chrome › computer");
  expect(toolLabel("mcp__plugin_github_github__create_issue")).toBe(
    "plugin_github_github › create_issue",
  );
  expect(toolLabel("Bash")).toBe("Bash");
});

describe("cost", () => {
  test("the context's share of the window stays between 0 and 1", () => {
    expect(contextShare(250_000, 1_000_000)).toBe(0.25);
    expect(contextShare(1_200_000, 1_000_000)).toBe(1);
    expect(contextShare(10, 0)).toBe(1);
  });

  test("the cache is warm until it expires, and unknown without a write", () => {
    const hour = 60 * 60_000;
    expect(cacheState({ cacheExpiresAt: NOW + 60_000, cacheTtlMs: hour }, NOW)).toEqual({
      warm: true,
      leftMs: 60_000,
      soon: true,
    });
    expect(cacheState({ cacheExpiresAt: NOW, cacheTtlMs: hour }, NOW)).toEqual({ warm: false });
    expect(cacheState({ cacheExpiresAt: null, cacheTtlMs: null }, NOW)).toBeNull();
  });

  test("a cache is nearly up at a share of its TTL, so a 5-minute one doesn't start there", () => {
    const fiveMin = 5 * 60_000;
    const at = (leftMs: number, ttl: number) =>
      cacheState({ cacheExpiresAt: NOW + leftMs, cacheTtlMs: ttl }, NOW);
    expect(at(4 * 60_000, fiveMin)).toMatchObject({ soon: false });
    expect(at(30_000, fiveMin)).toMatchObject({ soon: true });
    expect(at(20 * 60_000, 60 * 60_000)).toMatchObject({ soon: false });
  });

  test("spend bars are scaled against the tallest, with empty bars kept in place", () => {
    const bars = spendBars(
      {
        from: NOW,
        buckets: [
          [
            { projectId: 1, usd: 3 },
            { projectId: 2, usd: 1 },
          ],
          [],
          [{ projectId: 1, usd: 2 }],
        ],
      },
      600_000,
    );
    expect(bars.map((b) => b.start)).toEqual([NOW, NOW + 600_000, NOW + 1_200_000]);
    expect(bars.map((b) => b.total)).toEqual([4, 0, 2]);
    expect(bars[0]?.segments.map((x) => x.share)).toEqual([0.75, 0.25]);
    expect(bars[2]?.segments[0]?.share).toBe(0.5);
    // Nothing spent: no bar divides by zero
    expect(spendBars({ from: NOW, buckets: [[]] }, 600_000)[0]?.segments).toEqual([]);
  });
});
