import { expect, test } from "bun:test";
import {
  describeRegenerations,
  describeTargets,
  formatOutcome,
  summarizeFilter,
} from "../../../src/cli/commands/summarize.ts";
import type { NamedTarget, RegenerateReason } from "../../../src/server/summarize/store.ts";
import { AUTO_SUMMARY_DAYS } from "../../../src/shared/sections.ts";

const at = (d: number, h: number) => new Date(2026, 9, d, h).getTime();
const target = (start: number, mode: "summary" | "title"): NamedTarget => ({
  sessionId: "s",
  start,
  mode,
  project: "app",
});

test("the filter follows --since, --until and --limit", () => {
  expect(summarizeFilter({ period: {} })).toEqual({});
  expect(
    summarizeFilter({
      period: { since: { day: at(1, 0), text: "" }, until: { day: at(3, 0), text: "" } },
      limit: 5,
    }),
  ).toEqual({ startFrom: at(1, 0), startBefore: at(4, 0), limit: 5 });
});

test("the plan counts blocks and their range, or says none wait", () => {
  const targets = [
    target(at(3, 9), "summary"),
    target(at(1, 9), "title"),
    target(at(2, 9), "summary"),
  ];
  expect(describeTargets({ targets }, false)).toEqual([
    "3 blocks without a summary (2026-10-01 – 2026-10-03): 2 full summaries, 1 headlines only",
  ]);
  expect(describeTargets({ targets: [] }, false)).toEqual([
    "Every finished block already has a summary.",
  ]);
  expect(describeTargets({ targets: [] }, true)).toEqual([
    "No block in that range is waiting for a summary.",
  ]);
});

test("while a server summarizes, the plan says its days are left to it", () => {
  const lines = describeTargets({ targets: [], leftToServer: at(7, 0) }, false);
  expect(lines).toEqual([
    `Kairos is running, so blocks from the last ${AUTO_SUMMARY_DAYS} days are left to its own summaries.`,
    "No block in that range is waiting for a summary.",
  ]);
});

test("the closing line counts every outcome", () => {
  expect(formatOutcome({ summary: 3, title: 1, skipped: 2, failed: 0 }, "12s")).toBe(
    "Done in 12s: 3 summarized, 1 headline only, 2 skipped, 0 failed",
  );
});

test("an --old-format plan counts the summaries to rewrite and why, or says none are old", () => {
  const regen = (start: number, reason: RegenerateReason) => ({
    ...target(start, "summary"),
    reason,
  });
  expect(
    describeRegenerations(
      [regen(at(1, 9), "old-format"), regen(at(3, 9), "after-old-format")],
      false,
    ),
  ).toEqual([
    "2 summaries to regenerate (2026-10-01 – 2026-10-03), oldest first: 1 in the old format, 1 after them in the same sessions",
  ]);
  expect(describeRegenerations([regen(at(1, 9), "old-format")], false)).toEqual([
    "1 summary to regenerate (2026-10-01 – 2026-10-01), oldest first: 1 in the old format",
  ]);
  expect(
    describeRegenerations(
      [
        regen(at(2, 9), "older-prompt"),
        regen(at(2, 10), "older-prompt"),
        regen(at(3, 9), "headline-only"),
      ],
      false,
    ),
  ).toEqual([
    "3 summaries to regenerate (2026-10-02 – 2026-10-03), oldest first: 2 of headless runs from an older prompt, 1 of automation runs with only a headline",
  ]);
  expect(describeRegenerations([], false)).toEqual(["No summary is due to be regenerated."]);
  expect(describeRegenerations([], true)).toEqual([
    "No summary in that range is due to be regenerated.",
  ]);
});
