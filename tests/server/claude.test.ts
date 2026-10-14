import { describe, expect, test } from "bun:test";
import {
  type ClaudeExit,
  claudeArgs,
  DEFAULT_EFFORT,
  interpretExit,
  SummaryError,
} from "../../src/server/summarize/claude.ts";
import { summaryFailureKind } from "../../src/shared/summaryFailure.ts";

/** The value that follows `flag` in `args`, or undefined when the flag is missing. */
function valueAfter(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i < 0 ? undefined : args[i + 1];
}

describe("claudeArgs", () => {
  const args = claudeArgs("/bin/claude", { model: "haiku" });

  test("runs the given executable in print mode", () => {
    expect(args.slice(0, 2)).toEqual(["/bin/claude", "-p"]);
  });

  // These flags are what keeps a summary run free of side effects. Dropping any of them lets the
  // model use tools, MCP servers or user settings, or leaves a session behind.
  test("pins the side-effect-free flags", () => {
    expect(args).toContain("--no-session-persistence");
    expect(args).toContain("--strict-mcp-config");
    expect(valueAfter(args, "--tools")).toBe("");
    expect(valueAfter(args, "--setting-sources")).toBe("project");
  });

  test("passes the model and the effort, defaulting the effort", () => {
    expect(valueAfter(args, "--model")).toBe("haiku");
    expect(valueAfter(args, "--effort")).toBe(DEFAULT_EFFORT);
    expect(valueAfter(claudeArgs("c", { model: "opus", effort: "max" }), "--effort")).toBe("max");
  });

  test("is exactly the expected argv, so an added flag is a deliberate change", () => {
    expect(args).toEqual([
      "/bin/claude",
      "-p",
      "--model",
      "haiku",
      "--effort",
      DEFAULT_EFFORT,
      "--no-session-persistence",
      "--tools",
      "",
      "--strict-mcp-config",
      "--setting-sources",
      "project",
    ]);
  });
});

describe("interpretExit", () => {
  const ok: ClaudeExit = { out: "  answer\n", err: "", code: 0, timedOut: false, timeoutMs: 1000 };

  /** The SummaryError message `interpretExit` throws for `exit`. */
  function failure(exit: Partial<ClaudeExit>): string {
    try {
      interpretExit({ ...ok, ...exit });
    } catch (e) {
      expect(e).toBeInstanceOf(SummaryError);
      return (e as Error).message;
    }
    throw new Error("expected interpretExit to throw");
  }

  test("returns trimmed stdout on success", () => {
    expect(interpretExit(ok)).toBe("answer");
  });

  test.each<[string, Partial<ClaudeExit>, string]>([
    ["stderr on a non-zero exit", { code: 1, err: " Not logged in \n" }, "Not logged in"],
    ["stdout when stderr is empty", { code: 2, out: "bad request" }, "bad request"],
    ["the exit code when both are empty", { code: 3, out: "" }, "exit code 3"],
    ["stderr on empty output with exit 0", { out: "  ", err: "oops" }, "oops"],
    ["the exit code on blank output with exit 0", { out: "", err: "" }, "exit code 0"],
  ])("reports %s", (_name, exit, message) => {
    expect(failure(exit)).toBe(message);
  });

  test("cuts the message to 500 characters", () => {
    expect(failure({ code: 1, err: "x".repeat(600) })).toHaveLength(500);
  });

  test("says it timed out, even when the killed process wrote output", () => {
    const message = failure({ timedOut: true, timeoutMs: 180_000, code: 143, out: "partial" });
    expect(message).toBe("Did not finish within 180 seconds");
    expect(summaryFailureKind(message)).toBe("timeout");
  });
});
