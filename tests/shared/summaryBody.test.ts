import { describe, expect, test } from "bun:test";
import { parseSummaryBody } from "../../src/shared/summaryBody.ts";

/** What an older three-item body parses to: no Resolved, Open or Next. */
const older = (goal: string, done: string[], outcome: string) => ({
  goal,
  done,
  outcome,
  resolved: [],
  open: [],
  next: null,
});

describe("parseSummaryBody", () => {
  test("splits the current format, Open into kinds", () => {
    const body = [
      "- Goal: Fix the toolbar overflow (#18)",
      "- Done:",
      "  - Moved the compact switch from `md` to `lg`",
      "- Resolved:",
      "  - Overflow at 800px: fixed in b6d0358, check passes",
      "- Open:",
      "  - [todo] Month view not checked",
      "  - [issue] Review finding on the menu's focus ring left as is",
      "  - [question] Whether 768px needs its own layout",
      "  - [waiting] CI on PR #19",
      "- Next: Merge PR #19 once CI passes",
    ].join("\n");
    expect(parseSummaryBody(body)).toEqual({
      goal: "Fix the toolbar overflow (#18)",
      done: ["Moved the compact switch from `md` to `lg`"],
      resolved: ["Overflow at 800px: fixed in b6d0358, check passes"],
      open: [
        { kind: "todo", text: "Month view not checked" },
        { kind: "issue", text: "Review finding on the menu's focus ring left as is" },
        { kind: "question", text: "Whether 768px needs its own layout" },
        { kind: "waiting", text: "CI on PR #19" },
      ],
      next: "Merge PR #19 once CI passes",
      outcome: null,
    });
  });

  test("reads the current format's Japanese labels", () => {
    const body = [
      "- 目的：数字を更新する",
      "- やったこと：P07 を照合",
      "- 解決：PR #1575 マージ",
      "- 残課題：",
      "  - [waiting] P16 の確認待ち",
      "- 次の一手：P16 を照合",
    ].join("\n");
    expect(parseSummaryBody(body)).toMatchObject({
      resolved: ["PR #1575 マージ"],
      open: [{ kind: "waiting", text: "P16 の確認待ち" }],
      next: "P16 を照合",
    });
  });

  test("leaves out Resolved, Open and Next when there are none, or when they say none", () => {
    expect(parseSummaryBody("- Goal: a\n- Done: b")).toEqual({
      goal: "a",
      done: ["b"],
      resolved: [],
      open: [],
      next: null,
      outcome: null,
    });
    const none = parseSummaryBody(
      "- Goal: a\n- Done: b\n- Resolved: None\n- Open: なし\n- Next: -",
    );
    expect(none).toMatchObject({ resolved: [], open: [], next: null });
    const pending = parseSummaryBody(
      "- Goal: a\n- Done: b\n- Next: Nothing pending in this section.",
    );
    expect(pending?.next).toBeNull();
  });

  test("reads an empty optional item, a nested none or a 'not stated' as absent", () => {
    for (const tail of [
      "- Next:",
      "- Open:\n  - None",
      "- Next: Not stated in the transcript.",
      "- Resolved:\n- Next: 記載なし",
    ])
      expect(parseSummaryBody(`- Goal: a\n- Done: b\n${tail}`)).toMatchObject({
        resolved: [],
        open: [],
        next: null,
      });
  });

  test("doesn't take a link's text for a kind tag", () => {
    const body = "- Goal: a\n- Done: b\n- Open: [Issue](https://example.com/9) needs triage";
    expect(parseSummaryBody(body)?.open).toEqual([
      { kind: null, text: "[Issue](https://example.com/9) needs triage" },
    ]);
  });

  test("keeps an open item with a missing or unknown kind, tag and all", () => {
    const body = "- Goal: a\n- Done: b\n- Open:\n  - **[TODO]** c\n  - d\n  - [later] e";
    expect(parseSummaryBody(body)?.open).toEqual([
      { kind: "todo", text: "c" },
      { kind: null, text: "d" },
      { kind: null, text: "[later] e" },
    ]);
  });

  test("splits the prompt's three items, Done into one entry per point", () => {
    const body = [
      "- Goal: Fix the toolbar overflow (#18)",
      "- Done:",
      "  - Measured the toolbar in headless Chrome",
      "  - Moved the compact switch from `md` to `lg`",
      "- Outcome: Committed b6d0358; check passes",
    ].join("\n");
    expect(parseSummaryBody(body)).toEqual(
      older(
        "Fix the toolbar overflow (#18)",
        ["Measured the toolbar in headless Chrome", "Moved the compact switch from `md` to `lg`"],
        "Committed b6d0358; check passes",
      ),
    );
  });

  test("reads Japanese labels with full-width colons", () => {
    const body = "- 目的：数字を更新する\n- やったこと：\n  - P07 を照合\n- 結果：PR #1575 マージ";
    expect(parseSummaryBody(body)).toEqual(
      older("数字を更新する", ["P07 を照合"], "PR #1575 マージ"),
    );
  });

  test("reads labels the model set in bold", () => {
    const body = "- **Goal:** a\n- **Done**: b\n- **Outcome**: c";
    expect(parseSummaryBody(body)).toEqual(older("a", ["b"], "c"));
  });

  test("keeps continuation lines with their point and with the outcome", () => {
    const body = [
      "- Goal: a",
      "- Done:",
      "  - first point",
      "    still the first",
      "  - second",
      "- Outcome: merged",
      "  remaining: check P16",
    ].join("\n");
    expect(parseSummaryBody(body)).toEqual(
      older("a", ["first point\n  still the first", "second"], "merged\nremaining: check P16"),
    );
  });

  test("keeps an outcome written as a nested list as that list", () => {
    const body = "- Goal: a\n- Done: b\n- Outcome:\n  - Merged PR #13\n  - Left: month view";
    expect(parseSummaryBody(body)?.outcome).toBe("- Merged PR #13\n- Left: month view");
  });

  test("drops the headline the model repeated above the items", () => {
    for (const above of ["## Toolbar fix", "Toolbar fix", "Headline: Toolbar fix"]) {
      expect(parseSummaryBody(`${above}\n- Goal: a\n- Done: b\n- Outcome: c`)?.goal).toBe("a");
    }
  });

  test("reads CRLF line endings and tab indents", () => {
    const body = "- Goal: a\r\n- Done:\r\n\t- one\r\n  - two\r\n- Outcome: c";
    expect(parseSummaryBody(body)).toEqual(older("a", ["one", "two"], "c"));
  });

  test("keeps bold at the end of an item, dropping only the close of a line bolded whole", () => {
    expect(parseSummaryBody("- Goal: a\n- Done: b\n- Outcome: merged **PR #30**")?.outcome).toBe(
      "merged **PR #30**",
    );
    expect(parseSummaryBody("- **Goal: a**\n- Done: b\n- Outcome: c")?.goal).toBe("a");
  });

  test("returns null for a body in another format, so it is shown as written", () => {
    expect(parseSummaryBody("Just a paragraph about the work.")).toBeNull();
    // An item missing, or a list that isn't the summary's
    expect(parseSummaryBody("- one\n- Goal: a\n- Done: b\n- Outcome: c")).toBeNull();
    expect(parseSummaryBody("- Goal: a\n- Outcome: b")).toBeNull();
    // An item repeated
    expect(parseSummaryBody("- Goal: a\n- Goal: b\n- Done: c\n- Outcome: d")).toBeNull();
    // Text after the items that belongs to none of them
    expect(parseSummaryBody("- Goal: a\n- Done: b\n- Outcome: c\n\nA closing remark")).toBeNull();
    // More than a repeated headline before the items: content the structured view would drop
    expect(
      parseSummaryBody(
        "Toolbar fix\nContext: after the review\n- Goal: a\n- Done: b\n- Outcome: c",
      ),
    ).toBeNull();
    // An empty item
    expect(parseSummaryBody("- Goal:\n- Done: b\n- Outcome: c")).toBeNull();
  });
});
