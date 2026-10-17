import { describe, expect, test } from "bun:test";
import type { PickUpItem, PickUpSession, Project } from "../../src/shared/api.ts";
import { DAY, HOUR } from "../../src/shared/dates.ts";
import type { OpenKind } from "../../src/shared/summaryBody.ts";
import {
  isPickUpCandidate,
  PICK_UP_MAX,
  pickUp,
  pickUpScore,
  waitingCount,
} from "../../src/web/src/lib/pickUp.ts";

const NOW = 100 * DAY;

/** An open item of this kind, naming these refs. */
const item = (kind: OpenKind | null, refs: string[] = []): PickUpItem => ({
  id: 1,
  projectId: 1,
  kind,
  text: "text",
  sessionId: "s",
  start: 0,
  openedAt: 0,
  closedAt: null,
  closedBy: null,
  closedSessionId: null,
  closedStart: null,
  closedNote: null,
  refs,
});

/** A session last active `idle` ago, its latest block ending then too. */
const session = (over: Partial<PickUpSession> & { idle?: number } = {}): PickUpSession => {
  const { idle = HOUR, ...rest } = over;
  return {
    sessionId: "s",
    projectId: 1,
    launchCwd: "/repo",
    start: NOW - idle - HOUR,
    end: NOW - idle,
    headline: "headline",
    next: null,
    lastActive: NOW - idle,
    projectMovedAt: NOW - idle,
    items: [item("todo")],
    ...rest,
  };
};

const project = (id: number, hidden = false): Project => ({
  id,
  path: `/p${id}`,
  name: `p${id}`,
  color: null,
  repo: null,
  hidden,
});
const projects = new Map([1, 2, 3, 4].map((id) => [id, project(id)]));
const none = new Set<string>();

describe("isPickUpCandidate", () => {
  test("keeps a session active in the last 48 hours, whatever its project does", () => {
    expect(isPickUpCandidate(session({ idle: 47 * HOUR, projectMovedAt: 0 }), NOW)).toBe(true);
  });

  test("keeps an older session while its project moved in the last 3 days", () => {
    const old = { idle: 5 * DAY };
    expect(isPickUpCandidate(session({ ...old, projectMovedAt: NOW - 2 * DAY }), NOW)).toBe(true);
    expect(isPickUpCandidate(session({ ...old, projectMovedAt: NOW - 4 * DAY }), NOW)).toBe(false);
    expect(isPickUpCandidate(session({ ...old, projectMovedAt: null }), NOW)).toBe(false);
  });

  test("drops a session idle for 7 days, even in a busy project", () => {
    expect(isPickUpCandidate(session({ idle: 7 * DAY, projectMovedAt: NOW }), NOW)).toBe(false);
  });
});

describe("pickUpScore", () => {
  test("ranks by the heaviest kind left: waiting, next, todo, issue, question", () => {
    const scores = [
      session({ items: [item("question"), item("waiting")] }),
      session({ items: [item("question")], next: "the next step" }),
      session({ items: [item("todo")] }),
      session({ items: [item("issue")] }),
      session({ items: [item("question")] }),
    ].map((s) => pickUpScore(s, NOW));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(new Set(scores).size).toBe(scores.length);
  });

  test("halves every three days", () => {
    const fresh = pickUpScore(session({ idle: 0 }), NOW);
    expect(pickUpScore(session({ idle: 3 * DAY }), NOW)).toBeCloseTo(fresh / 2);
  });

  test("gives an item naming a ref a small bonus, less than a kind's step", () => {
    const plain = pickUpScore(session({ items: [item("issue")] }), NOW);
    const ref = pickUpScore(session({ items: [item("issue", ["#12"])] }), NOW);
    const todo = pickUpScore(session({ items: [item("todo")] }), NOW);
    expect(ref).toBeGreaterThan(plain);
    expect(ref).toBeLessThan(todo);
  });

  test("weighs an untagged item like a question", () => {
    expect(pickUpScore(session({ items: [item(null)] }), NOW)).toBe(
      pickUpScore(session({ items: [item("question")] }), NOW),
    );
  });
});

describe("pickUp", () => {
  const ids = (list: PickUpSession[]) => list.map((s) => s.sessionId);

  test("shows the best ranked first, a fresh todo over a waiting item a week old", () => {
    const list = pickUp(
      [
        session({ sessionId: "old", idle: 6 * DAY, projectMovedAt: NOW, items: [item("waiting")] }),
        session({ sessionId: "fresh", projectId: 2, items: [item("todo")] }),
      ],
      NOW,
      { projects, running: none },
    );
    expect(ids(list.shown)).toEqual(["fresh", "old"]);
  });

  test("caps a project at two and the list at five, the rest in more by rank", () => {
    const sessions = [1, 1, 1, 2, 2, 3, 4].map((projectId, i) =>
      session({ sessionId: `s${i}`, projectId, idle: (i + 1) * HOUR }),
    );
    const list = pickUp(sessions, NOW, { projects, running: none });
    expect(list.shown.length).toBe(PICK_UP_MAX);
    expect(ids(list.shown)).toEqual(["s0", "s1", "s3", "s4", "s5"]);
    expect(ids(list.more)).toEqual(["s2", "s6"]);
  });

  test("leaves out running sessions, hidden projects and stale sessions", () => {
    const hidden = new Map([...projects, [2, project(2, true)]]);
    const list = pickUp(
      [
        session({ sessionId: "running" }),
        session({ sessionId: "hidden", projectId: 2 }),
        session({ sessionId: "stale", idle: 8 * DAY }),
        session({ sessionId: "kept", projectId: 3 }),
      ],
      NOW,
      { projects: hidden, running: new Set(["running"]) },
    );
    expect(ids(list.shown)).toEqual(["kept"]);
    expect(list.more).toEqual([]);
  });
});

test("waitingCount counts the items blocked on you", () => {
  expect(waitingCount(session({ items: [item("waiting"), item("todo"), item("waiting")] }))).toBe(
    2,
  );
});
