import { afterEach, describe, expect, test } from "bun:test";
import type { LiveAgent, LiveSession, Project } from "../../src/shared/api.ts";
import { setLocale } from "../../src/web/src/i18n/index.ts";
import {
  AGENT_ROWS,
  agentRows,
  attentionCount,
  cacheState,
  columnOf,
  contextShare,
  delegateAgent,
  dirName,
  documentTitle,
  groupByColumn,
  IDLE_AFTER_MS,
  type LiveDisplay,
  listedAgents,
  liveCardView,
  liveDisplay,
  livePlace,
  rowDelegate,
  runningAgents,
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
    agents: [],
    delegate: null,
    fanOut: null,
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
});

describe("groupByColumn", () => {
  test("puts each session in its state's column, keeping the order, with every column present", () => {
    const sessions = [
      live("a", { state: "working" }),
      live("b", { state: "asking" }),
      live("c", { state: "waiting", since: NOW - IDLE_AFTER_MS }),
      live("d", { state: "working" }),
    ];
    const byColumn = groupByColumn(sessions, NOW);
    const ids = (c: "attention" | "working" | "idle") =>
      byColumn.get(c)?.map((e) => [e.session.id, e.display]);
    expect([...byColumn.keys()]).toEqual(["attention", "working", "idle"]);
    expect(ids("attention")).toEqual([["b", "asking"]]);
    expect(ids("working")).toEqual([
      ["a", "working"],
      ["d", "working"],
    ]);
    expect(ids("idle")).toEqual([["c", "idle"]]);
  });

  test("keeps empty columns", () => {
    expect([...groupByColumn([], NOW).values()]).toEqual([[], [], []]);
  });
});

describe("livePlace", () => {
  afterEach(() => setLocale("en"));

  test("names the project, worktree label and branch", () => {
    const s = live("a", { label: "wt", branch: "main" });
    expect(livePlace(s, { name: "kairos" })).toBe("kairos (wt) · main");
    expect(livePlace(live("a"), { name: "kairos" })).toBe("kairos");
  });

  test("falls back to the directory name without a project", () => {
    expect(livePlace(live("a", { branch: "main" }), undefined)).toBe("app · main");
  });

  test("follows the UI language", () => {
    setLocale("ja");
    expect(livePlace(live("a", { label: "wt", branch: "main" }), undefined)).toBe(
      "app（wt）・main",
    );
  });
});

describe("liveCardView", () => {
  const view = (over: Partial<LiveSession>, display: LiveDisplay = "waiting") =>
    liveCardView(live("a", over), display, undefined, NOW);

  test("names the session by its title, then its name, then its directory", () => {
    expect(view({}).name).toBe("a");
    expect(view({ title: null, name: "n" }).name).toBe("n");
    expect(view({ title: null }).name).toBe("app");
  });

  test("says the state and how long it has lasted, and turns an idle session into a row", () => {
    const card = view({ since: NOW - 5 * 60_000 }, "idle");
    expect(card).toMatchObject({ duration: "5m", compact: true, place: "app" });
    expect(card.description).toContain("5m");
    expect(view({}, "working").compact).toBe(false);
  });
});

describe("agentRows", () => {
  afterEach(() => setLocale("en"));

  /** A running subagent started `minutes` before NOW, with overrides. */
  const agent = (id: string, minutes: number, over: Partial<LiveAgent> = {}): LiveAgent => ({
    id,
    agentType: "Explore",
    name: null,
    description: null,
    callId: null,
    running: true,
    background: false,
    tool: null,
    startedAt: NOW - minutes * 60_000,
    lastAt: NOW,
    tokens: 0,
    ...over,
  });

  test("names each subagent and says how long it runs, or that it is done", () => {
    const { rows, more } = agentRows(
      [agent("a", 3), agent("b", 1, { agentType: null, running: false })],
      NOW,
    );
    expect(rows.map((r) => [r.name, r.status])).toEqual([
      ["Explore", "3m"],
      ["Subagent", "Done"],
    ]);
    expect(more).toBe(0);
  });

  test("folds subagents past the first few into a count", () => {
    const list = Array.from({ length: AGENT_ROWS + 2 }, (_, i) => agent(`a${i}`, i));
    const { rows, more } = agentRows(list, NOW);
    expect(rows).toHaveLength(AGENT_ROWS);
    expect(more).toBe(2);
  });

  test("speaks the UI language", () => {
    setLocale("ja");
    expect(
      agentRows([agent("a", 1, { agentType: null, running: false })], NOW).rows[0],
    ).toMatchObject({
      name: "サブエージェント",
      status: "完了",
    });
  });

  test("names a subagent by its own name before its type", () => {
    expect(agentRows([agent("a", 1, { name: "code-review" })], NOW).rows[0]?.name).toBe(
      "code-review",
    );
  });

  test("takes the delegate out of the rows, for the call line to show", () => {
    const session = live("s", { agents: [agent("a", 2), agent("b", 1)], delegate: "a" });
    expect(delegateAgent(session)?.id).toBe("a");
    expect(listedAgents(session).map((a) => a.id)).toEqual(["b"]);
    const none = live("s", { agents: [agent("a", 2)] });
    expect(delegateAgent(none)).toBeNull();
    expect(listedAgents(none)).toHaveLength(1);
  });

  test("gives a row's subagent line the delegate only when there is something to say of it", () => {
    const named = live("s", { agents: [agent("a", 1)], delegate: "a" });
    expect(rowDelegate(named)?.id).toBe("a");
    const blank = agent("a", 1, { agentType: null, description: null, tool: null });
    expect(rowDelegate(live("s", { agents: [blank], delegate: "a" }))).toBeNull();
    expect(rowDelegate(live("s", { agents: [agent("a", 1)] }))).toBeNull();
  });

  test("counts the subagents still running", () => {
    expect(runningAgents([agent("a", 1), agent("b", 1, { running: false }), agent("c", 1)])).toBe(
      2,
    );
  });
});
