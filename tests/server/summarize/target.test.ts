import { expect, test } from "bun:test";
import { modeOf, RUN_SUMMARY_MIN_TOOLS } from "../../../src/server/summarize/target.ts";
import { MINUTE } from "../../../src/shared/dates.ts";

const section = { start: 0, end: 3 * MINUTE, promptCount: 0, toolCalls: 0, runKind: null };

test.each([
  ["a person's short section", {}, "title"],
  ["a person's section with two prompts", { promptCount: 2 }, "summary"],
  [
    "an automation run that did work",
    { runKind: "automation", toolCalls: RUN_SUMMARY_MIN_TOOLS },
    "summary",
  ],
  ["an automation run with a few calls", { runKind: "automation", toolCalls: 4 }, "title"],
  ["a long automation run", { runKind: "automation", end: 12 * MINUTE }, "summary"],
  [
    "a long trial run with many calls",
    { runKind: "trial", end: 30 * MINUTE, toolCalls: 40 },
    "title",
  ],
] as const)("modeOf: %s", (_, change, mode) => {
  expect(modeOf({ ...section, ...change })).toBe(mode);
});
