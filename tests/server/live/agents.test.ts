import { describe, expect, test } from "bun:test";
import { liveAgents, phaseOf } from "../../../src/server/live/agents.ts";
import { SID } from "../../fixtures/ids.ts";
import { min } from "../ingest/helpers.ts";
import { addAgent, appendMain, call, ingested, prompt, result } from "./helpers.ts";

/** A tail row with the given kind, newest first like the query returns them. */
const row = (
  kind: string,
  over: { name?: string; id?: string; text?: string; ts?: number } = {},
) => ({
  kind,
  tool_name: over.name ?? null,
  tool_use_id: over.id ?? null,
  text: over.text ?? null,
  meta: null,
  ts: over.ts ?? 0,
});

/** Long after the rows' default time, when every reply has settled. */
const LATER = 3_600_000;

describe("phaseOf", () => {
  test.each([
    ["nothing logged yet", [], false],
    ["after its first prompt", [row("prompt")], true],
    [
      "after a result it hasn't answered",
      [row("tool_result", { id: "a" }), row("tool_use", { id: "a", name: "Bash" })],
      true,
    ],
    ["after a reply with no call", [row("assistant"), row("tool_result", { id: "a" })], false],
    [
      "after its handback call",
      [row("tool_result", { id: "h" }), row("tool_use", { id: "h", name: "SubagentHandback" })],
      false,
    ],
    ["after Esc", [row("interrupt"), row("tool_use", { id: "a", name: "Bash" })], false],
    ["after a message from its caller", [row("peer"), row("assistant")], true],
  ])("%s: running is %p", (_name, tail, running) => {
    expect(phaseOf(tail, LATER).running).toBe(running);
  });

  test("shows the call in flight", () => {
    const phase = phaseOf(
      [row("tool_use", { id: "a", name: "Grep", text: "  needle\n in  src ", ts: 7 })],
      LATER,
    );
    expect(phase).toEqual({
      running: true,
      tool: { name: "Grep", text: "needle in src", since: 7 },
    });
  });

  test("among parallel calls, shows the newest one still without a result", () => {
    const phase = phaseOf(
      [
        row("tool_result", { id: "b" }),
        row("tool_use", { id: "b", name: "Read" }),
        row("tool_use", { id: "a", name: "Bash" }),
        row("tool_result", { id: "z" }),
        row("tool_use", { id: "z", name: "Edit" }),
      ],
      LATER,
    );
    expect(phase).toMatchObject({ running: true, tool: { name: "Bash" } });
  });

  test("a fresh reply may still be followed by a call, so it doesn't end the subagent yet", () => {
    const tail = [row("assistant", { ts: LATER - 1_000 }), row("tool_result", { id: "a" })];
    expect(phaseOf(tail, LATER).running).toBe(true);
    expect(phaseOf(tail, LATER + 60_000).running).toBe(false);
  });

  test("thinks between calls once every call of the batch returned", () => {
    const phase = phaseOf(
      [
        row("tool_result", { id: "a" }),
        row("tool_use", { id: "a", name: "Bash" }),
        row("tool_result", { id: "z" }),
        row("tool_use", { id: "z", name: "Edit" }),
      ],
      LATER,
    );
    expect(phase).toEqual({ running: true, tool: null });
  });
});

describe("liveAgents", () => {
  test("lists a foreground subagent that just finished, then drops it", () => {
    const { db } = ingested();
    const [agent] = liveAgents(db, SID.subagent, "working", min(305));
    expect(agent).toMatchObject({
      id: "a1b2c3d4e5f60718",
      agentType: "code-reviewer",
      description: "PR #42 のレビュー",
      running: false,
      background: false,
      tool: null,
      lastAt: min(304.5),
    });
    expect(agent?.startedAt).toBe(min(300.6));
    expect(agent?.tokens).toBeGreaterThan(0);
    expect(liveAgents(db, SID.subagent, "working", min(310))).toEqual([]);
  });

  test("a background subagent runs on after its launch returned, and shows its call", () => {
    const { db, projectsDir, ingest } = ingested();
    appendMain(
      projectsDir,
      call("main", 320, "toolu_bg_launch", "Agent", { description: "Scan", prompt: "Scan" }),
    );
    appendMain(projectsDir, result(320.1, "toolu_bg_launch", "Async agent launched"));
    addAgent(
      projectsDir,
      "abg0000000000001",
      { agentType: "Explore", description: "Scan", toolUseId: "toolu_bg_launch" },
      [
        prompt("abg0000000000001", 320.05),
        call("abg0000000000001", 321, "toolu_bg_grep", "Grep", { pattern: "needle" }),
      ],
    );
    ingest();
    // The session went idle: a background subagent keeps running anyway
    const [agent] = liveAgents(db, SID.subagent, "waiting", min(322));
    expect(agent).toMatchObject({
      id: "abg0000000000001",
      running: true,
      background: true,
      tool: { name: "Grep", since: min(321) },
    });
    // Quiet for too long, it is taken as gone
    expect(liveAgents(db, SID.subagent, "waiting", min(340))).toEqual([]);
  });

  test("a foreground subagent stops counting as running once the session is idle", () => {
    const { db, projectsDir, ingest } = ingested();
    appendMain(
      projectsDir,
      call("main", 320, "toolu_fg", "Agent", { description: "Fix", prompt: "Fix" }),
    );
    addAgent(
      projectsDir,
      "afg0000000000001",
      { agentType: "general-purpose", description: "Fix", toolUseId: "toolu_fg" },
      [prompt("afg0000000000001", 320.05)],
    );
    ingest();
    expect(liveAgents(db, SID.subagent, "working", min(321))[0]).toMatchObject({
      running: true,
      background: false,
      tool: null,
    });
    expect(liveAgents(db, SID.subagent, "waiting", min(321))[0]?.running).toBe(false);
  });

  test("a foreground subagent cut off by Esc isn't taken for a background one", () => {
    const { db, projectsDir, ingest } = ingested();
    appendMain(projectsDir, call("main", 320, "toolu_cut", "Agent", { description: "Fix" }));
    addAgent(
      projectsDir,
      "acut000000000001",
      { agentType: "general-purpose", description: "Fix", toolUseId: "toolu_cut" },
      [
        prompt("acut000000000001", 320.05),
        call("acut000000000001", 321, "toolu_cut_bash", "Bash", { command: "bun test" }),
      ],
    );
    // Esc answers the waiting call after the subagent's last message, and the turn ends
    appendMain(projectsDir, result(322, "toolu_cut", "[Request interrupted by user for tool use]"));
    ingest();
    expect(liveAgents(db, SID.subagent, "waiting", min(323))[0]).toMatchObject({
      running: false,
      background: false,
    });
  });

  test("a subagent whose meta file isn't read yet follows the turn", () => {
    const { db, projectsDir, ingest } = ingested();
    addAgent(projectsDir, "anometa000000001", null, [prompt("anometa000000001", 320.05)]);
    ingest();
    expect(liveAgents(db, SID.subagent, "working", min(321))[0]).toMatchObject({
      agentType: null,
      running: true,
      background: false,
    });
    expect(liveAgents(db, SID.subagent, "waiting", min(321))[0]?.running).toBe(false);
  });

  test("lists running subagents first, each group oldest first", () => {
    const { db, projectsDir, ingest } = ingested();
    addAgent(projectsDir, "awf0000000000002", { agentType: "b" }, [
      prompt("awf0000000000002", 304),
    ]);
    addAgent(projectsDir, "awf0000000000001", { agentType: "a" }, [
      prompt("awf0000000000001", 303),
    ]);
    ingest();
    const ids = liveAgents(db, SID.subagent, "working", min(305)).map((a) => [a.id, a.running]);
    expect(ids).toEqual([
      ["awf0000000000001", true],
      ["awf0000000000002", true],
      ["a1b2c3d4e5f60718", false],
    ]);
  });
});
