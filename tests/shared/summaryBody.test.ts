import { describe, expect, test } from "bun:test";
import { parseSummaryBody } from "../../src/shared/summaryBody.ts";

describe("parseSummaryBody", () => {
  test("splits the prompt's three items, Done into one entry per point", () => {
    const body = [
      "- Goal: Fix the toolbar overflow (#18)",
      "- Done:",
      "  - Measured the toolbar in headless Chrome",
      "  - Moved the compact switch from `md` to `lg`",
      "- Outcome: Committed b6d0358; check passes",
    ].join("\n");
    expect(parseSummaryBody(body)).toEqual({
      goal: "Fix the toolbar overflow (#18)",
      done: [
        "Measured the toolbar in headless Chrome",
        "Moved the compact switch from `md` to `lg`",
      ],
      outcome: "Committed b6d0358; check passes",
    });
  });

  test("reads Japanese labels with full-width colons", () => {
    const body = "- 目的：数字を更新する\n- やったこと：\n  - P07 を照合\n- 結果：PR #1575 マージ";
    expect(parseSummaryBody(body)).toEqual({
      goal: "数字を更新する",
      done: ["P07 を照合"],
      outcome: "PR #1575 マージ",
    });
  });

  test("reads labels the model set in bold", () => {
    const body = "- **Goal:** a\n- **Done**: b\n- **Outcome**: c";
    expect(parseSummaryBody(body)).toEqual({ goal: "a", done: ["b"], outcome: "c" });
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
    expect(parseSummaryBody(body)).toEqual({
      goal: "a",
      done: ["first point\n  still the first", "second"],
      outcome: "merged\nremaining: check P16",
    });
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
    expect(parseSummaryBody(body)).toEqual({ goal: "a", done: ["one", "two"], outcome: "c" });
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
    expect(parseSummaryBody("- Goal: a\n- Done: b")).toBeNull();
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
