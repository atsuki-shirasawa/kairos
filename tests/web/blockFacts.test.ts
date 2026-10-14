import { describe, expect, test } from "bun:test";
import type { Artifact } from "../../src/shared/api.ts";
import {
  markFacts,
  momentsSpeech,
  timeRange,
  tooltipFacts,
} from "../../src/web/src/lib/blockFacts.ts";
import { layoutDay, type PlacedBlock } from "../../src/web/src/lib/layout.ts";
import type { Moment } from "../../src/web/src/lib/moments.ts";
import { at, DAY0, H, session } from "./helpers.ts";

const project = { id: 1, name: "kairos" } as Parameters<typeof tooltipFacts>[1]["project"];
const look = { project, faded: false, dim: true };

/** The blocks laid out on DAY0 for one session per [start, end] hour span. */
function blocks(...spans: [number, number][]): PlacedBlock[] {
  return layoutDay(
    spans.map(([from, to], i) => ({
      ...session(`s${i}`, [at(from), at(to)]),
      headless: true,
    })),
    DAY0,
  );
}

describe("timeRange", () => {
  test("names both ends, or one time when they fall in the same minute", () => {
    expect(timeRange({ dayStart: DAY0, start: 10 * H, end: 11.5 * H })).toBe("10:00–11:30");
    expect(timeRange({ dayStart: DAY0, start: 10 * H, end: 10 * H + 20_000 })).toBe("10:00");
  });
});

describe("tooltipFacts", () => {
  test("reads a block's heading, project, range and results", () => {
    const [block] = blocks([9, 10]);
    if (!block) throw new Error("no block laid out");
    expect(tooltipFacts(block, { ...look, moments: [] })).toMatchObject({
      label: "s0",
      projectName: "kairos",
      range: "9:00–10:00",
      durationMs: H,
      commits: 0,
      prs: 0,
      open: [],
      note: null,
      dim: true,
    });
  });
});

describe("markFacts", () => {
  test("a single mark reads as its block", () => {
    const runs = blocks([9, 9.05]);
    const [first] = runs;
    if (!first) throw new Error("no block laid out");
    expect(markFacts(runs, first, { ...look, hourPx: 48 })).toEqual(
      tooltipFacts(first, { ...look, moments: [] }),
    );
  });

  test("a burst reads as its count, spans to the run that ends last, and is never dim", () => {
    const runs = blocks([9, 9.1], [9.02, 9.05]);
    const [first] = runs;
    if (!first) throw new Error("no block laid out");
    const facts = markFacts(runs, first, { ...look, hourPx: 48 });
    expect(facts).toMatchObject({
      label: "2 headless runs",
      range: "9:00–9:06",
      durationMs: 0.1 * H,
      open: [],
      dim: false,
    });
    expect(facts.note).not.toBeNull();
  });
});

describe("momentsSpeech", () => {
  const moment = (kind: "commit" | "pr", ref: string, title: string): Moment => ({
    artifact: { kind, ref, title, ts: at(10) } as Artifact,
    y: 0,
  });

  test("reads each commit and PR, then counts those past the limit", () => {
    const moments = [
      moment("pr", "https://github.com/o/r/pull/12", "Add a"),
      moment("commit", "abcdef1234567", "Fix b"),
      moment("commit", "1234567abcdef", "Fix c"),
    ];
    expect(momentsSpeech(moments, 2)).toBe(
      "PR #12 at 10:00: Add a; Commit abcdef1 at 10:00: Fix b; +1 more",
    );
  });
});
