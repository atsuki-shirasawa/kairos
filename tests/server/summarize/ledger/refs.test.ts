import { describe, expect, test } from "bun:test";
import { isClosable, itemRefs, refsOf } from "../../../../src/server/summarize/ledger/refs.ts";

describe("refsOf", () => {
  test("reads issue and PR numbers, URLs, Jira keys and tasks", () => {
    expect(
      refsOf(
        "Review of #42 (https://github.com/me/app/pull/43, /issues/44), APP-31, task #3, タスク #4",
      ).sort(),
    ).toEqual(["#42", "#43", "#44", "APP-31", "task:3", "task:4"]);
  });

  test("leaves out encodings, anchors and HTML entities", () => {
    expect(refsOf("UTF-8 and ISO-8601, see README#2 and &#39;")).toEqual([]);
  });
});

describe("itemRefs", () => {
  const task = (id: string, subject: string) => ({ id, subject, status: "pending", touched: true });

  test("adds the tasks whose subject the item quotes, ignoring case", () => {
    expect(
      itemRefs("Add a BOM to the CSV export (#21)", [task("1", "add a bom to the csv")]),
    ).toEqual(["#21", "task:1"]);
  });

  test("ignores subjects too short to tell apart", () => {
    expect(itemRefs("Fix the docs", [task("1", "docs")])).toEqual([]);
  });
});

describe("isClosable", () => {
  test.each([
    ["#12", true],
    ["task:3", true],
    ["PROJ-7", false],
    ["12", false],
  ])("%s → %p", (ref, closable) => {
    expect(isClosable(ref)).toBe(closable);
  });
});
