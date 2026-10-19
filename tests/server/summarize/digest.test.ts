import { describe, expect, test } from "bun:test";
import {
  buildDigest,
  type DigestMessage,
  noticeLine,
  subagentReport,
} from "../../../src/server/summarize/digest.ts";

const call = (id: string, tool: string, text: string): DigestMessage => ({
  kind: "tool_use",
  text,
  tool_name: tool,
  tool_use_id: id,
});
const result = (id: string, text: string, isError = 0): DigestMessage => ({
  kind: "tool_result",
  text,
  tool_name: null,
  tool_use_id: id,
  is_error: isError,
});

describe("subagent reports", () => {
  test("an Agent call's result is quoted without Claude Code's hand-back preamble", () => {
    const d = buildDigest([
      call("a", "Agent", "Implement the fix"),
      result(
        "a",
        "[Subagent hand-back] The text below is the final report. The report follows:\n  Fixed the parser on impl/1; the gate passed.",
      ),
    ]);
    expect(d).toContain("→ Agent: Implement the fix");
    expect(d).toContain("← report: Fixed the parser on impl/1; the gate passed.");
    expect(d).not.toContain("hand-back");
  });

  test("a failed Agent call is no report", () => {
    const d = buildDigest([call("a", "Agent", "Review"), result("a", "Agent type not found", 1)]);
    expect(d).toBe("→ Agent: Review");
  });

  test("a background launch's receipt is no report", () => {
    expect(subagentReport("Async agent launched successfully. agentId: x")).toBeNull();
  });

  test("a task notification reads as what finished and the head of its result", () => {
    const text =
      '<task-notification>\n<task-id>x</task-id>\n<summary>Agent "Review the diff" finished</summary>\n<result>No findings.</result>\n</task-notification>';
    expect(noticeLine(text)).toBe('Agent "Review the diff" finished: No findings.');
    expect(buildDigest([{ kind: "notification", text, tool_name: null }])).toBe(
      '[Done] Agent "Review the diff" finished: No findings.',
    );
  });
});

describe("headless runs", () => {
  test("ScheduleWakeup leaves out the request it repeats", () => {
    const d = buildDigest([call("w", "ScheduleWakeup", "Do one iteration of the loop")]);
    expect(d).toBe("→ ScheduleWakeup");
  });

  test("leadingResults quotes the first results, where a run reads its assignment", () => {
    const messages = [
      call("1", "Bash", "cat assignment.json"),
      result("1", '{ "issue": 42 }'),
      call("2", "Bash", "git status"),
      result("2", "clean"),
    ];
    expect(buildDigest(messages)).not.toContain("issue");
    const d = buildDigest(messages, { leadingResults: 1 });
    expect(d).toContain('← { "issue": 42 }');
    expect(d).not.toContain("← clean");
  });

  test("reports, errors and quiet tools don't use up the quoted results", () => {
    const d = buildDigest(
      [
        call("w", "ScheduleWakeup", "again"),
        result("w", "Next wakeup scheduled"),
        call("a", "Agent", "Plan"),
        result("a", "Async agent launched successfully."),
        call("1", "Bash", "gh issue view 42"),
        result("1", "Fix the parser"),
      ],
      { leadingResults: 1 },
    );
    expect(d).toContain("← Fix the parser");
    expect(d).not.toContain("Next wakeup");
  });
});
