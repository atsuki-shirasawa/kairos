import { describe, expect, test } from "bun:test";
import type { LiveSession, Project } from "../../src/shared/api.ts";
import {
  attentionCount,
  dirName,
  documentTitle,
  IDLE_AFTER_MS,
  liveDisplay,
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
