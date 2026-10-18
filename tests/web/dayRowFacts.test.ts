import { describe, expect, test } from "bun:test";
import { setLocale } from "../../src/web/src/i18n/index.ts";
import { blocksOfDay } from "../../src/web/src/lib/dayBlocks.ts";
import { resolvedPoints, rowFacts } from "../../src/web/src/lib/dayRowFacts.ts";
import { at, DAY0, session } from "./helpers.ts";

describe("resolvedPoints", () => {
  test("the first two Resolved points, or an older body's Outcome", () => {
    const body = "- Goal: g\n- Resolved:\n  - one\n  - two\n  - three\n- Done: d";
    expect(resolvedPoints(body)).toEqual(["one", "two"]);
    expect(resolvedPoints("- Goal: g\n- Outcome: shipped\n- Done: d")).toEqual(["shipped"]);
  });

  test("nothing without a summary, or for a body in neither format", () => {
    expect(resolvedPoints(null)).toEqual([]);
    expect(resolvedPoints("free text")).toEqual([]);
  });
});

describe("rowFacts", () => {
  const commit = (ts: number, ref: string) => ({ kind: "commit" as const, ref, title: ref, ts });

  test("an unsummarized block's heading is dim", () => {
    const [block] = blocksOfDay([session("a", [at(9), at(10)])], DAY0);
    if (!block) throw new Error("no block");
    expect(rowFacts([block], block).dim).toBe(true);
  });

  test("a block lists its first three commits and counts the rest", () => {
    const s = session("a", [at(9), at(11)]);
    const segment = s.segments[0];
    if (segment) segment.commits = [1, 2, 3, 4].map((i) => commit(at(9 + i / 10), `c${i}`));
    const [block] = blocksOfDay([s], DAY0);
    if (!block) throw new Error("no block");
    const facts = rowFacts([block], block);
    expect(facts.artifacts.map((a) => a.ref)).toEqual(["c1", "c2", "c3"]);
    expect(facts.moreArtifacts).toBe(1);
    expect(facts.range).toBe("9:00–11:00");
  });

  test("a burst of runs reads as its count and span, like its mark", () => {
    setLocale("en");
    const blocks = blocksOfDay(
      [session("r1", [at(9), at(9.05)]), session("r2", [at(9.1), at(9.2)])],
      DAY0,
    );
    const facts = rowFacts(blocks, blocks[1] as (typeof blocks)[number]);
    expect(facts.label).toBe("2 headless runs");
    expect(facts.range).toBe("9:00–9:12");
    // Its heading is a count, not a first prompt waiting for a summary
    expect(facts.dim).toBe(false);
    expect(facts.turns).toBeNull();
  });
});
