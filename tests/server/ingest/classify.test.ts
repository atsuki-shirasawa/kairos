import { describe, expect, test } from "bun:test";
import { classifyUser, commandText, type UserKind } from "../../../src/server/ingest/classify.ts";

const user = (content: unknown, extra: Record<string, unknown> = {}) => ({
  type: "user",
  message: { role: "user", content },
  ...extra,
});
const human = { origin: { kind: "human" } };

describe("classifyUser", () => {
  test.each<[string, Record<string, unknown>, UserKind]>([
    ["typed prompt", user("hi", { ...human, promptSource: "typed" }), "prompt"],
    [
      "human input via the sdk is still a prompt",
      user("hi", { ...human, promptSource: "sdk" }),
      "prompt",
    ],
    ["slash command", user("<command-name>/loop</command-name>", human), "command"],
    [
      "output starting with < is meta even with a human origin",
      user("<local-command-stdout>x</local-command-stdout>", human),
      "meta",
    ],
    ["automatic run", user("# /loop tick", { isMeta: true, turnOrigin: "scheduled" }), "scheduled"],
    [
      "task notification",
      user("<task-notification>…", { origin: { kind: "task-notification" } }),
      "notification",
    ],
    ["peer", user("Another Claude session…", { isMeta: true, origin: { kind: "peer" } }), "peer"],
    [
      "interrupt",
      user([{ type: "text", text: "[Request interrupted by user for tool use]" }]),
      "interrupt",
    ],
    [
      "tool result",
      user([{ type: "tool_result", tool_use_id: "t", content: "ok" }]),
      "tool_result",
    ],
    ["compaction summary", user("Summary", { isCompactSummary: true }), "compact_summary"],
    ["no origin (claude -p etc.)", user("Run this", { promptSource: "sdk" }), "sdk_prompt"],
    [
      "slash command from the SDK (no promptSource)",
      user("<command-name>/goal</command-name>", { entrypoint: "sdk-cli" }),
      "sdk_prompt",
    ],
    [
      "hook text in an SDK session",
      user("A Stop hook is active", { entrypoint: "sdk-cli", isMeta: true }),
      "meta",
    ],
    [
      "command without origin in an interactive session",
      user("<command-name>/clear</command-name>"),
      "meta",
    ],
  ])("%s", (_name, r, expected) => {
    expect(classifyUser(r)).toBe(expected);
  });
});

test("commandText", () => {
  expect(commandText("<command-name>/loop</command-name>\n<command-args>30m</command-args>")).toBe(
    "/loop 30m",
  );
  expect(commandText("<command-name>/compact</command-name><command-args></command-args>")).toBe(
    "/compact",
  );
});
