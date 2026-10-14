import { describe, expect, test } from "bun:test";
import {
  displayBranch,
  knownTitle,
  sectionHeadline,
  summaryBody,
  type TitleSource,
  title,
} from "../../../src/server/queries/titles.ts";

const none: TitleSource = {
  custom_title: null,
  agent_name: null,
  ai_title: null,
  first_prompt: null,
};

describe("knownTitle", () => {
  test.each<[string, Partial<TitleSource>, string | null]>([
    ["nothing to title it by", { first_prompt: "  " }, null],
    [
      "the first line of the first prompt",
      { first_prompt: "fix the build\nand more" },
      "fix the build",
    ],
    ["the automatic title over the prompt", { ai_title: "Auto", first_prompt: "p" }, "Auto"],
    ["the agent name over the automatic title", { agent_name: "agent", ai_title: "Auto" }, "agent"],
    ["the /rename name over everything", { custom_title: "Mine", agent_name: "agent" }, "Mine"],
  ])("%s", (_, over, expected) => {
    expect(knownTitle({ ...none, ...over })).toBe(expected);
  });

  test("cuts a long first line at 120 characters", () => {
    expect(knownTitle({ ...none, first_prompt: "x".repeat(200) })).toBe("x".repeat(120));
  });
});

test("title falls back to a placeholder", () => {
  expect(title(none)).toBe("(Untitled session)");
  expect(title({ ...none, ai_title: "Auto" })).toBe("Auto");
});

test("sectionHeadline prefers the summary, then the block's title, then the session's", () => {
  expect(sectionHeadline({ headline: "H", fallback_title: "F" }, "S")).toBe("H");
  expect(sectionHeadline({ headline: null, fallback_title: "F" }, "S")).toBe("F");
  expect(sectionHeadline({ headline: null, fallback_title: null }, "S")).toBe("S");
});

test("summaryBody treats an empty body as not summarized", () => {
  expect(summaryBody({ body: "" })).toBeNull();
  expect(summaryBody({ body: null })).toBeNull();
  expect(summaryBody({ body: "done" })).toBe("done");
});

test("displayBranch drops a detached HEAD and keeps real branches", () => {
  expect(displayBranch("HEAD")).toBeNull();
  expect(displayBranch(null)).toBeNull();
  expect(displayBranch("main")).toBe("main");
  expect(displayBranch("")).toBe("");
});
