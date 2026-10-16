import { describe, expect, test } from "bun:test";
import {
  type ClaudeExit,
  claudeArgs,
  DEFAULT_EFFORT,
  interpretExit,
  readEnvelope,
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

  test("asks for a JSON envelope that follows the schema only when one is given", () => {
    const schema = { type: "object", properties: { headline: { type: "string" } } };
    const withSchema = claudeArgs("c", { model: "haiku", schema });
    expect(withSchema.slice(0, claudeArgs("c", { model: "haiku" }).length)).toEqual(
      claudeArgs("c", { model: "haiku" }),
    );
    expect(valueAfter(withSchema, "--output-format")).toBe("json");
    expect(JSON.parse(valueAfter(withSchema, "--json-schema") ?? "")).toEqual(schema);
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

  test("reports the error an envelope carries on a failed run, over stray stderr", () => {
    const out = JSON.stringify({ is_error: true, result: "Not logged in · Please run /login" });
    const message = failure({ code: 1, out, err: "warning: something unrelated" });
    expect(message).toBe("Not logged in · Please run /login");
    expect(summaryFailureKind(message)).toBe("login");
  });

  test("says it timed out, even when the killed process wrote output", () => {
    const message = failure({ timedOut: true, timeoutMs: 180_000, code: 143, out: "partial" });
    expect(message).toBe("Did not finish within 180 seconds");
    expect(summaryFailureKind(message)).toBe("timeout");
  });
});

describe("readEnvelope", () => {
  const envelope = {
    type: "result",
    is_error: false,
    structured_output: { headline: "Login form" },
    total_cost_usd: 0.0021,
    duration_ms: 2875,
    usage: {
      input_tokens: 2,
      cache_creation_input_tokens: 3934,
      cache_read_input_tokens: 100,
      output_tokens: 90,
    },
  };

  test("reads the structured answer, counting cached input with the rest", () => {
    expect(readEnvelope(JSON.stringify(envelope))).toEqual({
      output: { headline: "Login form" },
      stats: { inputTokens: 4036, outputTokens: 90, costUsd: 0.0021, latencyMs: 2875 },
    });
  });

  test("counts what the envelope leaves out as zero", () => {
    expect(readEnvelope(JSON.stringify({ structured_output: 1 })).stats).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 0,
    });
  });

  test("throws on an error envelope or output that isn't one", () => {
    expect(() => readEnvelope(JSON.stringify({ is_error: true, result: "rate limit" }))).toThrow(
      new SummaryError("rate limit"),
    );
    expect(() => readEnvelope("Login form\n\n- Goal: g")).toThrow(SummaryError);
  });
});
