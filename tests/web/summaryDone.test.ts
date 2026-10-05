import { describe, expect, test } from "bun:test";
import type { Artifact, Recap } from "../../src/shared/api.ts";
import type { DayBlock } from "../../src/web/src/lib/layout.ts";
import type { ProjectSummary } from "../../src/web/src/lib/summary.ts";
import { prLabel, startsNewDay, unwrittenRecaps } from "../../src/web/src/lib/summaryDone.ts";

const DAY0 = new Date(2026, 9, 5).getTime();
const H = 3_600_000;

const project = (projectId: number | null): ProjectSummary => ({
  projectId,
  busyMs: H,
  blocks: [],
  clipped: [],
  prs: [],
  commits: 0,
  usage: null,
});

const recap = (projectId: number, r: Partial<Recap>): Recap => ({
  projectId,
  from: 0,
  to: 0,
  body: null,
  model: null,
  createdAt: null,
  stale: false,
  pending: false,
  error: null,
  ...r,
});

describe("unwrittenRecaps", () => {
  test("lists missing and stale recaps in the order shown, skipping pending ones", () => {
    const recaps = new Map([
      [1, recap(1, { body: "done" })],
      [2, recap(2, {})],
      [3, recap(3, { body: "old", stale: true })],
      [4, recap(4, { pending: true })],
    ]);
    const shown = [3, 1, 4, 2, null, 5].map(project);
    expect(unwrittenRecaps(shown, recaps)).toEqual([3, 2]);
  });
});

describe("startsNewDay", () => {
  const block = (start: number) => ({ segment: { start } }) as DayBlock;
  const blocks = [block(DAY0 + 9 * H), block(DAY0 + 15 * H), block(DAY0 + 33 * H)];

  test("is true for the first block and where the day changes", () => {
    expect(blocks.map((_, i) => startsNewDay(blocks, i))).toEqual([true, false, true]);
  });
});

describe("prLabel", () => {
  const pr = (ref: string, title: string | null): Artifact => ({ kind: "pr", ref, title, ts: 0 });

  test("shows the number of a GitHub PR", () => {
    expect(prLabel(pr("https://github.com/me/app/pull/42", "Fix"))).toBe("#42");
  });

  test("falls back to the title, then the reference", () => {
    expect(prLabel(pr("https://example.com/mr/1", "Fix"))).toBe("Fix");
    expect(prLabel(pr("https://example.com/mr/1", ""))).toBe("https://example.com/mr/1");
  });
});
