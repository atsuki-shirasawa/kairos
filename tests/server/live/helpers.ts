// Helpers shared by the live page's server tests: appending responses to a fixture log, writing
// subagents under fixture 6's session, and the calendar's default visibility.
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionVisibility } from "../../../src/server/visibility.ts";
import { SID } from "../../fixtures/ids.ts";
import { min, setup } from "../ingest/helpers.ts";

/** The calendar's default visibility: a person's sessions and automation runs, no hidden directories. */
export const VISIBLE: SessionVisibility = { runs: "automation", hiddenCwds: [] };

/** Appends a text response with `usage` (Claude API field names) to the facts session's log. */
export function appendResponse(
  projectsDir: string,
  n: number,
  usage: Record<string, unknown>,
  model = "claude-opus-5-5",
): void {
  const record = {
    parentUuid: null,
    isSidechain: false,
    type: "assistant",
    message: {
      id: `msg_usage_${n}`,
      type: "message",
      role: "assistant",
      model,
      content: [{ type: "text", text: "Done." }],
      stop_reason: "end_turn",
      usage: { output_tokens: 100, ...usage },
    },
    uuid: `21212121-usage-${n}`,
    timestamp: new Date(min(1700 + n)).toISOString(),
    entrypoint: "cli",
    cwd: "/Users/me/dev/app",
    sessionId: SID.facts,
    version: "2.1.289",
  };
  appendFileSync(
    join(projectsDir, "-Users-me-dev-app", `${SID.facts}.jsonl`),
    `${JSON.stringify(record)}\n`,
  );
}

/** Fixture 6's session directory, which holds its subagents. */
const SESSION_DIR = join("-Users-me-dev-app", SID.subagent);

/** Fixture 6 ingested: one code-reviewer subagent, run in the foreground from 300.6 to 304.5 min. */
export function ingested() {
  const s = setup();
  s.ingester.scan();
  return { ...s, ingest: () => void s.ingester.scan() };
}

/** Writes a subagent's log, and its meta file unless `meta` is null, under fixture 6's session. */
export function addAgent(
  projectsDir: string,
  agentId: string,
  meta: Record<string, unknown> | null,
  records: Record<string, unknown>[],
): void {
  const dir = join(projectsDir, SESSION_DIR, "subagents");
  if (meta) writeFileSync(join(dir, `agent-${agentId}.meta.json`), JSON.stringify(meta));
  writeFileSync(
    join(dir, `agent-${agentId}.jsonl`),
    `${records.map((r) => JSON.stringify(record(agentId, r))).join("\n")}\n`,
  );
}

/** A subagent record of fixture 6's session with Claude Code's common fields. */
function record(agentId: string, r: Record<string, unknown>): Record<string, unknown> {
  return {
    parentUuid: null,
    isSidechain: true,
    agentId,
    cwd: "/Users/me/dev/app",
    sessionId: SID.subagent,
    version: "2.1.289",
    ...r,
  };
}

/** A record at `minute`, with a uuid unique to the agent and minute. */
export const at = (agentId: string, minute: number, r: Record<string, unknown>) => ({
  uuid: `${agentId}-${minute}`,
  timestamp: new Date(min(minute)).toISOString(),
  ...r,
});

/** A subagent's first message at `minute`, the task it was given. */
export const prompt = (agentId: string, minute: number) =>
  at(agentId, minute, { type: "user", message: { role: "user", content: "Look around" } });

/** A response at `minute` that makes one call, as Claude Code logs each block on its own line. */
export const call = (agentId: string, minute: number, id: string, name: string, input: unknown) =>
  at(agentId, minute, {
    type: "assistant",
    message: {
      id: `msg_${agentId}_${minute}`,
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "tool_use", id, name, input }],
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 20 },
    },
  });

/** Appends a record to fixture 6's main log. */
export function appendMain(projectsDir: string, r: Record<string, unknown>): void {
  appendFileSync(
    join(projectsDir, "-Users-me-dev-app", `${SID.subagent}.jsonl`),
    `${JSON.stringify({ parentUuid: null, isSidechain: false, cwd: "/Users/me/dev/app", sessionId: SID.subagent, version: "2.1.289", ...r })}\n`,
  );
}

/** The main conversation's result for call `id` at `minute`. */
export const result = (minute: number, id: string, content: string) =>
  at("main", minute, {
    type: "user",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content }] },
  });
