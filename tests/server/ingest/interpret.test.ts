import { describe, expect, test } from "bun:test";
import type { UserKind } from "../../../src/server/ingest/classify.ts";
import {
  nextAutoTurn,
  type StoredUserKind,
  storedUserKind,
  storedUserText,
  type TextUserKind,
} from "../../../src/server/ingest/interpret.ts";
import { LIMIT } from "../../../src/server/ingest/limits.ts";

const ALL_KINDS: UserKind[] = [
  "prompt",
  "command",
  "scheduled",
  "tool_result",
  "interrupt",
  "notification",
  "peer",
  "compact_summary",
  "sdk_prompt",
  "meta",
];

describe("nextAutoTurn", () => {
  const cases: [UserKind, boolean, boolean][] = [
    ["scheduled", false, true],
    ["scheduled", true, true],
    ["prompt", true, false],
    ["command", true, false],
    ["prompt", false, false],
  ];
  test.each(cases)("%s with autoTurn=%p → %p", (kind, before, after) => {
    expect(nextAutoTurn(before, kind)).toBe(after);
  });

  test("other kinds leave the turn as it was", () => {
    const others = ALL_KINDS.filter((k) => !["scheduled", "prompt", "command"].includes(k));
    for (const kind of others) {
      expect(nextAutoTurn(true, kind)).toBe(true);
      expect(nextAutoTurn(false, kind)).toBe(false);
    }
  });
});

describe("storedUserKind", () => {
  const cases: [UserKind, boolean, StoredUserKind | null][] = [
    ["meta", false, null],
    ["meta", true, "prompt"],
    ["sdk_prompt", false, "sdk_prompt"],
    ["sdk_prompt", true, "prompt"],
    ["compact_summary", false, "compact_summary"],
    ["compact_summary", true, null],
    ["prompt", true, "prompt"],
    ["tool_result", true, "tool_result"],
    ["peer", false, "peer"],
  ];
  for (const [kind, inSubagent, stored] of cases) {
    test(`${kind} (subagent=${inSubagent}) → ${stored}`, () => {
      expect(storedUserKind(kind, inSubagent)).toBe(stored);
    });
  }
});

describe("storedUserText", () => {
  const command = "<command-name>/loop</command-name><command-args>30m</command-args>";
  const cases: [TextUserKind, string, string][] = [
    ["prompt", "  fix the build \n", "fix the build"],
    ["command", command, "/loop 30m"],
    ["sdk_prompt", `  ${command}  `, "/loop 30m"],
    ["sdk_prompt", "  summarize this \n", "summarize this"],
    ["scheduled", " tick ", "tick"],
    ["interrupt", "[Request interrupted by user] ", "[Request interrupted by user]"],
    [
      "notification",
      "<task-notification>done</task-notification>\n",
      "<task-notification>done</task-notification>",
    ],
    ["compact_summary", "\n summary \n", "summary"],
  ];
  test.each(cases)("%s: %p → %p", (kind, text, stored) => {
    expect(storedUserText(kind, {}, text)).toBe(stored);
  });

  test("a peer message stores its origin body, else the content text, untrimmed", () => {
    expect(storedUserText("peer", { origin: { kind: "peer", body: "hello" } }, "raw")).toBe(
      "hello",
    );
    expect(storedUserText("peer", { origin: { kind: "peer" } }, " raw ")).toBe(" raw ");
  });

  test("prompts keep up to the long limit, notices up to the short one", () => {
    const long = "x".repeat(LIMIT.text + 10);
    expect(storedUserText("prompt", {}, long)).toStartWith(`${"x".repeat(LIMIT.text)}\n…`);
    expect(storedUserText("notification", {}, long)).toStartWith(`${"x".repeat(LIMIT.short)}\n…`);
  });

  test("a compact summary past its limit keeps its end", () => {
    const text = `${"a".repeat(LIMIT.compactSummary)}THE END`;
    expect(storedUserText("compact_summary", {}, text).endsWith("THE END")).toBe(true);
  });
});
