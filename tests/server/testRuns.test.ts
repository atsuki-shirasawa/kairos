import { describe, expect, test } from "bun:test";
import { isTestRun, lastTestRun, runnerCommand } from "../../src/server/testRuns.ts";
import { bash, call } from "./calls.ts";

describe("isTestRun", () => {
  test("counts foreground runners where a command starts", () => {
    expect(isTestRun(bash("cd web && bun test", "ok"))).toBe(true);
    expect(isTestRun(bash("grep -r jest package.json", "ok"))).toBe(false);
    expect(isTestRun(call({ toolName: "Read", text: "bun test" }))).toBe(false);
  });

  test("leaves out a run started in the background", () => {
    const bg = call({
      toolName: "Bash",
      text: "bun test",
      input: JSON.stringify({ command: "bun test", run_in_background: true }),
    });
    expect(isTestRun(bg)).toBe(false);
  });
});

describe("runnerCommand", () => {
  test("keeps a command whose runner is on its first line whole", () => {
    expect(runnerCommand("cd web && bun test")).toBe("cd web && bun test");
  });

  test("keeps continued lines with the runner's command, before and after it", () => {
    expect(runnerCommand("cd web && \\\n  bun test")).toBe("cd web && \\\n  bun test");
    expect(runnerCommand("echo hi\nbun test \\\n  --coverage")).toBe("… bun test \\\n  --coverage");
  });
});

describe("lastTestRun", () => {
  test("gives the live page the part of the command that ran the tests", () => {
    const run = lastTestRun([bash("python3 - <<'EOF'\nx\nEOF\nbun test", "0 fail")]);
    expect(run).toMatchObject({ command: "… bun test", outcome: "passed" });
  });

  test("tells a failed run from one whose exit status is hidden", () => {
    expect(lastTestRun([bash("bun test", "1 fail", true)])?.outcome).toBe("FAILED");
    expect(lastTestRun([bash("bun test | tail -5", "1 fail")])?.outcome).toBe("ended");
  });

  test("is null without a test run", () => {
    expect(lastTestRun([bash("git status", "clean")])).toBeNull();
  });
});
