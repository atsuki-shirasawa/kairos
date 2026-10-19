import { describe, expect, test } from "bun:test";
import { liveAgents } from "../../../src/server/live/agents.ts";
import { batchProgress, fanOutOf, launchedRunning } from "../../../src/server/live/fanOut.ts";
import type { LiveAgent, LiveState } from "../../../src/shared/api.ts";
import { SID } from "../../fixtures/ids.ts";
import { min } from "../ingest/helpers.ts";
import { addAgent, appendMain, at, call, ingested, prompt, result } from "./helpers.ts";

/** A subagent's closing reply at `minute`, which ends it once settled. */
const reply = (agentId: string, minute: number) =>
  at(agentId, minute, {
    type: "assistant",
    message: {
      id: `msg_${agentId}_${minute}_reply`,
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text: "No findings." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 20 },
    },
  });

/**
 * Launches subagents in one response at `minute` (one call per line, as Claude Code logs them):
 * in the background, acknowledged at once, unless `foreground`, when the calls wait. Returns the
 * call ids.
 */
function launchBatch(
  projectsDir: string,
  names: readonly string[],
  { minute = 320, foreground = false } = {},
): string[] {
  const ids = names.map((n) => `toolu_batch_${n}`);
  ids.forEach((id, i) => {
    appendMain(projectsDir, call("main", minute + i * 0.01, id, "Agent", { description: id }));
  });
  if (foreground) return ids;
  ids.forEach((id, i) => {
    appendMain(projectsDir, result(minute + 0.1 + i * 0.01, id, "Async agent launched"));
  });
  return ids;
}

describe("fanOutOf", () => {
  /**
   * The fan-out of fixture 6's session at `minute` in `state`, from what `liveAgents` lists then, looking for
   * launch calls since minute 300 (the work block's start, as the live page passes it).
   */
  function fanOutAt(
    db: Parameters<typeof liveAgents>[0],
    minute: number,
    state: LiveState = "waiting",
  ) {
    const agents = liveAgents(db, SID.subagent, state, min(minute));
    return fanOutOf(db, SID.subagent, agents, min(300));
  }

  test("counts the subagents of a batch that finished, and those still to start", () => {
    const { db, projectsDir, ingest } = ingested();
    // c's subagent hasn't written anything yet: it is still to come, not done
    const [a, b] = launchBatch(projectsDir, ["a", "b", "c"]);
    const meta = (callId: string | undefined) => ({
      agentType: "code-reviewer",
      toolUseId: callId,
    });
    addAgent(projectsDir, "abatch00000000a1", meta(a), [
      prompt("abatch00000000a1", 320.2),
      reply("abatch00000000a1", 321),
    ]);
    addAgent(projectsDir, "abatch00000000b1", meta(b), [
      prompt("abatch00000000b1", 320.2),
      call("abatch00000000b1", 323, "toolu_b_bash", "Bash", { command: "bun test" }),
    ]);
    ingest();
    expect(fanOutAt(db, 324)).toEqual({ done: 1, total: 3 });
  });

  test("a single launch isn't a batch", () => {
    const { db, projectsDir, ingest } = ingested();
    const [a] = launchBatch(projectsDir, ["solo"]);
    addAgent(projectsDir, "asolo0000000001", { toolUseId: a }, [prompt("asolo0000000001", 320.2)]);
    ingest();
    expect(fanOutAt(db, 321)).toBeNull();
  });

  test("takes the batch of the newest running subagent, apart from an earlier response's", () => {
    const { db, projectsDir, ingest } = ingested();
    launchBatch(projectsDir, ["old1", "old2"], { minute: 310 });
    const [x, y] = launchBatch(projectsDir, ["new1", "new2"]);
    addAgent(projectsDir, "anew00000000001", { toolUseId: x }, [prompt("anew00000000001", 320.2)]);
    addAgent(projectsDir, "anew00000000002", { toolUseId: y }, [prompt("anew00000000002", 320.3)]);
    ingest();
    expect(fanOutAt(db, 321)).toEqual({ done: 0, total: 2 });
  });

  test("is gone once every subagent of the batch finished", () => {
    const { db, projectsDir, ingest } = ingested();
    const [a, b] = launchBatch(projectsDir, ["d1", "d2"]);
    addAgent(projectsDir, "adone0000000001", { toolUseId: a }, [
      prompt("adone0000000001", 320.2),
      reply("adone0000000001", 321),
    ]);
    addAgent(projectsDir, "adone0000000002", { toolUseId: b }, [
      prompt("adone0000000002", 320.2),
      reply("adone0000000002", 321),
    ]);
    ingest();
    expect(fanOutAt(db, 322)).toBeNull();
  });

  test("finds the batch of a subagent that started long after its call, queued behind others", () => {
    const { db, projectsDir, ingest } = ingested();
    // Claude Code runs only so many calls of a response at once: q2 waits for q1 to finish
    const [a, b] = launchBatch(projectsDir, ["q1", "q2"], { foreground: true });
    addAgent(projectsDir, "aqueue000000001", { toolUseId: a }, [
      prompt("aqueue000000001", 320.2),
      reply("aqueue000000001", 324),
    ]);
    addAgent(projectsDir, "aqueue000000002", { toolUseId: b }, [prompt("aqueue000000002", 325)]);
    ingest();
    expect(fanOutAt(db, 326, "working")).toEqual({ done: 1, total: 2 });
  });

  test("a subagent's own helper doesn't hide the main conversation's batch", () => {
    const { db, projectsDir, ingest } = ingested();
    const [a, b] = launchBatch(projectsDir, ["m1", "m2"]);
    addAgent(projectsDir, "amain0000000001", { toolUseId: a }, [prompt("amain0000000001", 320.2)]);
    addAgent(projectsDir, "amain0000000002", { toolUseId: b }, [prompt("amain0000000002", 320.2)]);
    // Launched from m1's log, so its call isn't in the main one; it started last
    addAgent(projectsDir, "ahelper00000001", { toolUseId: "toolu_inner" }, [
      prompt("ahelper00000001", 321),
    ]);
    ingest();
    expect(fanOutAt(db, 322)).toEqual({ done: 0, total: 2 });
  });
});

describe("launchedRunning", () => {
  const agent = (id: string, over: Partial<LiveAgent>): LiveAgent => ({
    id,
    agentType: null,
    name: null,
    description: null,
    callId: `call_${id}`,
    running: true,
    background: false,
    tool: null,
    startedAt: 0,
    lastAt: 0,
    tokens: 0,
    ...over,
  });

  test("keeps the running subagents a call launched, newest first", () => {
    const list = [
      agent("old", { startedAt: 1 }),
      agent("done", { startedAt: 3, running: false }),
      agent("workflow", { startedAt: 4, callId: null }),
      agent("new", { startedAt: 2 }),
    ];
    expect(launchedRunning(list).map((a) => a.id)).toEqual(["new", "old"]);
  });
});

describe("batchProgress", () => {
  test("counts started subagents that no longer run as done", () => {
    const calls = ["a", "b", "c", "d"];
    expect(batchProgress(calls, new Set(["a", "b", "c"]), new Set(["b"]))).toEqual({
      done: 2,
      total: 4,
    });
  });

  test("is none for a lone launch", () => {
    expect(batchProgress(["a"], new Set(["a"]), new Set(["a"]))).toBeNull();
  });
});
