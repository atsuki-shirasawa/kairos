import { describe, expect, test } from "bun:test";
import { openDb } from "../../src/server/db/index.ts";
import { buildDigest } from "../../src/server/summarize/digest.ts";
import {
  compactPending,
  FACTS_LIMIT,
  type FactsInput,
  formatFacts,
  issueOps,
  loadFacts,
  questionsOf,
  testSummary,
} from "../../src/server/summarize/facts.ts";
import { taskStates } from "../../src/server/tasks.ts";
import { bash, call } from "./calls.ts";

const empty: FactsInput = {
  artifacts: [],
  calls: [],
  tasks: [],
  interrupts: 0,
  recaps: [],
  compactSummaries: [],
};

describe("questionsOf", () => {
  const ask = (result: string, isError = false) =>
    call({
      toolName: "AskUserQuestion",
      input: JSON.stringify({ questions: [{ question: "Which one?", options: [] }] }),
      result,
      isError,
    });

  test("pairs each question with its answer", () => {
    expect(
      questionsOf([
        ask('Your questions have been answered: "Which one?"="B", "Why?"="speed". You can now…'),
      ]),
    ).toEqual(["- Which one? → B", "- Why? → speed"]);
  });

  test("says so when the user declined", () => {
    expect(
      questionsOf([ask("The user doesn't want to proceed with this tool use.", true)]),
    ).toEqual(["- Which one? → declined"]);
  });
});

describe("issueOps", () => {
  test("lists closed and filed issues, skipping failed calls", () => {
    expect(
      issueOps([
        bash("gh issue close 12 --comment done && gh issue close #13", "ok"),
        bash("gh issue close https://github.com/me/app/issues/14", "ok"),
        bash(
          "gh issue create --title 'docs: syntax' --body x",
          "https://github.com/me/app/issues/15",
        ),
        bash('gh issue create -t "no url"', "error", true),
        bash('git tag -a v1 -t x && gh issue create --title "$(cat t.txt)"', "https://x/issues/16"),
      ]),
    ).toEqual([
      "- closed #12",
      "- closed #13",
      "- closed #14",
      '- filed #15 "docs: syntax"',
      "- filed #16",
    ]);
  });
});

describe("testSummary", () => {
  test("reports the last run with its totals, and earlier failures", () => {
    expect(
      testSummary([
        bash("bun test", "3 pass\n1 fail", true),
        bash("ls", "x"),
        bash("bun run check", "Checked\n409 pass\n0 fail"),
      ]),
    ).toBe("last run `bun run check` passed (409 pass / 0 fail); 1 earlier run(s) failed");
  });

  test("says a failing last run failed", () => {
    expect(testSummary([bash("uv run pytest -q", "E   assert 1 == 2\n1 failed", true)])).toBe(
      "last run `uv run pytest -q` FAILED (E assert 1 == 2 / 1 failed)",
    );
  });

  test("doesn't call a run passed when a pipe or `|| true` hides its exit status", () => {
    for (const cmd of ["bun run check 2>&1 | tail -20", "pytest || true", "bun test; echo done"])
      expect(testSummary([bash(cmd, "1 fail")])).toStartWith(
        `last run \`${cmd}\` ended (exit status hidden by the command; see its output)`,
      );
    expect(testSummary([bash("bun test | tail -5", "1 fail", true)])).toContain("FAILED");
  });

  test("counts runners where a command starts, past wrappers, not where they are mentioned", () => {
    for (const cmd of [
      "cd web && bun test",
      "CI=1 uv run --locked pytest -q",
      "timeout 600 npx vitest run",
    ])
      expect(testSummary([bash(cmd, "ok")])).toContain("passed");
    for (const cmd of [
      "grep -r jest package.json",
      'git commit -m "fix: make bun test green"',
      "echo pytest",
    ])
      expect(testSummary([bash(cmd, "ok")])).toBeNull();
  });

  test("names a multi-line command from the line that runs the tests", () => {
    const cmd = "python3 - <<'EOF'\nprint('edit')\nEOF\nbun run format; bun run check";
    expect(testSummary([bash(cmd, "0 fail")])).toStartWith(
      "last run `… bun run format; bun run check` passed",
    );
  });

  test("doesn't call a run passed when a following line hides its exit status", () => {
    expect(testSummary([bash("echo hi\nbun run check\necho done", "1 fail")])).toStartWith(
      "last run `… bun run check echo done` ended",
    );
    expect(testSummary([bash("bun test \\\n  --coverage", "0 fail")])).toContain("passed");
  });

  test("leaves out a run started in the background", () => {
    const bg = call({
      toolName: "Bash",
      text: "bun test",
      input: JSON.stringify({ command: "bun test", run_in_background: true }),
      result: "Command running in background with ID: b1",
    });
    expect(testSummary([bash("bun test", "3 pass\n1 fail", true), bg])).toStartWith(
      "last run `bun test` FAILED",
    );
  });

  test("is null without a test run", () => {
    expect(testSummary([bash("git status", "clean")])).toBeNull();
  });
});

describe("compactPending", () => {
  test("takes the pending tasks, current work and next step, bold headings or not", () => {
    const text = [
      "1. **Primary Request and Intent:**",
      "   Long history…",
      "7. **Pending Tasks:**",
      "   - Write docs",
      "8. Current Work:",
      "   Editing the README.",
      "9. **Optional Next Step**",
      "   Open a PR.",
    ].join("\n");
    expect(compactPending(text)).toBe(
      "Pending tasks:\n- Write docs\nCurrent work:\nEditing the README.\nNext step:\nOpen a PR.",
    );
  });

  test("falls back to the end of a summary without those headings", () => {
    expect(compactPending(`${"x".repeat(3000)}end`)).toEndWith("xend");
  });
});

describe("formatFacts", () => {
  test("is empty when the log records nothing", () => {
    expect(formatFacts(empty)).toBe("");
  });

  test("lists commits, PRs and merges without repeating a PR number", () => {
    const text = formatFacts({
      ...empty,
      artifacts: [
        { kind: "commit", ref: "1a2b3c4d5e", title: "feat: x" },
        { kind: "pr", ref: "https://github.com/me/app/pull/42", title: "#42 me/app" },
        { kind: "pr", ref: "https://github.com/me/app/pull/43", title: "fix: y" },
        { kind: "merge", ref: "#42", title: null },
      ],
    });
    expect(text).toBe(
      "Commits and PRs:\n- commit 1a2b3c4 feat: x\n- opened PR #42 me/app\n- opened PR #43 fix: y\n- merged PR #42",
    );
  });

  test("shows tasks the section touched and earlier ones still open, not earlier finished ones", () => {
    const create = (subject: string, id: string, ts: number) =>
      call({
        toolName: "TaskCreate",
        ts,
        input: JSON.stringify({ subject }),
        result: `Task #${id} created`,
      });
    const done = (id: string, ts: number) =>
      call({
        toolName: "TaskUpdate",
        ts,
        input: JSON.stringify({ taskId: id, status: "completed" }),
      });
    const text = formatFacts({
      ...empty,
      tasks: taskStates(
        [
          create("old done", "1", 10),
          done("1", 20),
          create("old open", "2", 30),
          create("new", "3", 110),
          done("3", 120),
        ],
        100,
      ),
    });
    expect(text).toBe(
      "Tasks at the end of this section:\n- [pending] #2 old open\n- [completed] #3 new",
    );
  });

  test("is capped in length by dropping whole lines", () => {
    const text = formatFacts({ ...empty, recaps: Array(100).fill("y".repeat(500)) });
    expect(text.length).toBeLessThanOrEqual(FACTS_LIMIT + 30);
    expect(text).toEndWith(`- ${"y".repeat(500)}\n\n… (more facts omitted)`);
  });
});

describe("buildDigest", () => {
  const reply = (text: string) => ({ kind: "assistant", text, tool_name: null });

  test("keeps the last reply nearly whole, clipping earlier ones", () => {
    const long = `${"a".repeat(1000)}LEFT`;
    const d = buildDigest([
      reply(long),
      { kind: "prompt", text: "next", tool_name: null },
      reply(long),
    ]);
    expect(d.match(/LEFT/g)).toHaveLength(1);
    expect(d).toEndWith("LEFT");
  });

  test("shows failed tests, git and gh calls, but not other failures", () => {
    const d = buildDigest([
      { kind: "tool_use", text: "bun test", tool_name: "Bash", tool_use_id: "a" },
      { kind: "tool_result", text: "x\n1 fail", tool_name: null, tool_use_id: "a", is_error: 1 },
      { kind: "tool_use", text: "gh pr merge 3", tool_name: "Bash", tool_use_id: "b" },
      {
        kind: "tool_result",
        text: "not mergeable",
        tool_name: null,
        tool_use_id: "b",
        is_error: 1,
      },
      { kind: "tool_use", text: "ls nope", tool_name: "Bash", tool_use_id: "c" },
      { kind: "tool_result", text: "No such file", tool_name: null, tool_use_id: "c", is_error: 1 },
      { kind: "tool_use", text: "bun test", tool_name: "Bash", tool_use_id: "d" },
      { kind: "tool_result", text: "1 pass", tool_name: null, tool_use_id: "d", is_error: 0 },
    ]);
    expect(d).toBe(
      [
        "→ Bash: bun test",
        "    ✗ failed: 1 fail",
        "  → Bash: gh pr merge 3",
        "    ✗ failed: not mergeable",
        "  → Bash: ls nope",
        "  → Bash: bun test",
      ].join("\n"),
    );
  });
});

describe("loadFacts", () => {
  test("a recap and a PR just after the section stay out once the next block has started", () => {
    const db = openDb(":memory:");
    db.run(
      "INSERT INTO ingest_state (id, path, session_id, parser_version) VALUES (1, 'f', 's', 1)",
    );
    db.run("INSERT INTO sessions (id) VALUES ('s')");
    db.run("INSERT INTO segments (session_id, start, end) VALUES ('s', 0, 600000)");
    const note = db.query(
      "INSERT INTO messages (id, session_id, file_id, seq, ts, kind, text) VALUES (?, 's', 1, ?, ?, 'away_summary', ?)",
    );
    const pr = db.query(
      "INSERT INTO artifacts (session_id, kind, ref, ts, file_id) VALUES ('s', 'pr', ?, ?, 1)",
    );
    note.run("n1", 1, 780_000, "stood at review");
    pr.run("#7", 840_000);
    expect(loadFacts(db, "s", 0, 600_000)).toMatchObject({
      recaps: ["stood at review"],
      artifacts: [{ ref: "#7" }],
    });
    // A block split off on a topic change starts a minute after the first ends
    db.run("INSERT INTO segments (session_id, start, end) VALUES ('s', 660000, 3600000)");
    expect(loadFacts(db, "s", 0, 600_000)).toMatchObject({ recaps: [], artifacts: [] });
  });
});
