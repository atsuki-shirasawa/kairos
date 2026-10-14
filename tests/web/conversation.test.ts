import { describe, expect, test } from "bun:test";
import type { Message } from "../../src/shared/api.ts";
import {
  firstLine,
  notificationSummary,
  toolResultsById,
  withDaySeparators,
} from "../../src/web/src/lib/conversation.ts";

const DAY0 = new Date(2026, 9, 5).getTime(); // 2026-10-05 00:00
const H = 3_600_000;

function msg(id: string, over: Partial<Message> = {}): Message {
  return {
    id,
    ts: null,
    kind: "assistant",
    text: null,
    toolName: null,
    toolUseId: null,
    detail: null,
    isError: false,
    isScheduled: false,
    isCopy: false,
    ...over,
  };
}

/** Each row as "day:<id>" or the message's id. */
const shape = (messages: Message[]) =>
  withDaySeparators(messages).map((r) => (r.type === "day" ? `day:${r.id}` : r.message.id));

describe("withDaySeparators", () => {
  test("marks the first dated message and each change of date", () => {
    const messages = [
      msg("a", { ts: DAY0 + 9 * H }),
      msg("b", { ts: DAY0 + 10 * H }),
      msg("c", { ts: DAY0 + 25 * H }),
      msg("d", { ts: DAY0 + 26 * H }),
    ];
    expect(shape(messages)).toEqual(["day:a", "a", "b", "day:c", "c", "d"]);
  });

  test("gives the day row the message's time", () => {
    const [row] = withDaySeparators([msg("a", { ts: DAY0 + H })]);
    expect(row).toEqual({ type: "day", ts: DAY0 + H, id: "a" });
  });

  test("lets undated messages through without starting or ending a day", () => {
    const messages = [
      msg("a"),
      msg("b", { ts: DAY0 + H }),
      msg("c"),
      msg("d", { ts: DAY0 + 2 * H }),
    ];
    expect(shape(messages)).toEqual(["a", "day:b", "b", "c", "d"]);
  });

  test("leaves out tool results, which don't move the day either", () => {
    const messages = [
      msg("a", { ts: DAY0 + H }),
      msg("r", { kind: "tool_result", ts: DAY0 + 30 * H }),
      msg("b", { ts: DAY0 + 2 * H }),
    ];
    expect(shape(messages)).toEqual(["day:a", "a", "b"]);
  });
});

describe("toolResultsById", () => {
  test("indexes tool results by the call they answer", () => {
    const result = msg("r", { kind: "tool_result", toolUseId: "t1" });
    const map = toolResultsById([
      msg("u", { kind: "tool_use", toolUseId: "t1" }),
      result,
      msg("x", { kind: "tool_result", toolUseId: null }),
    ]);
    expect([...map.entries()]).toEqual([["t1", result]]);
  });
});

describe("firstLine", () => {
  test("takes the first line without a heading mark", () => {
    expect(firstLine("## Daily check\nmore")).toBe("Daily check");
    expect(firstLine("plain")).toBe("plain");
    expect(firstLine(null)).toBe("");
  });
});

describe("notificationSummary", () => {
  test("prefers the summary tag, trimmed", () => {
    expect(notificationSummary("<task>\n<summary>\n  Build done\n</summary></task>")).toBe(
      "Build done",
    );
  });

  test("falls back to the first line without a summary, or with an empty one", () => {
    expect(notificationSummary("# Agent finished\ndetails")).toBe("Agent finished");
    expect(notificationSummary("<summary> </summary>\nnext")).toBe("<summary> </summary>");
  });
});
