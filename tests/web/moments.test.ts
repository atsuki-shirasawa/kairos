import { describe, expect, test } from "bun:test";
import { layoutDay } from "../../src/web/src/lib/layout.ts";
import {
  blockMoments,
  clampInside,
  type Moment,
  momentMarks,
  momentRows,
  pullUp,
  pushDown,
} from "../../src/web/src/lib/moments.ts";
import { DAY0, H, session as sessionOf } from "./helpers.ts";

const DAY1 = new Date(2026, 9, 6).getTime();

/** A finished session with one block per [start, end] span. */
const session = (id: string, spans: [number, number][]) => sessionOf(id, ...spans);

describe("blockMoments", () => {
  const commit = (ts: number | null, ref = "c") => ({
    kind: "commit" as const,
    ref,
    title: null,
    ts,
  });
  const pr = (ts: number) => ({ kind: "pr" as const, ref: "p", title: null, ts });
  /** The placed blocks of one session with a single segment, on `day`. */
  const placed = (from: number, to: number, artifacts: ReturnType<typeof commit>[], day = DAY0) => {
    const s = session("m", [[from, to]]);
    const seg = s.segments[0];
    if (seg) seg.commits = artifacts;
    return layoutDay([s], day);
  };

  test("places commits and PRs at the height of their time, PRs first on a tie", () => {
    const s = session("m", [[DAY0 + 10 * H, DAY0 + 12 * H]]);
    const seg = s.segments[0];
    if (seg) {
      seg.commits = [commit(DAY0 + 11 * H)];
      seg.prs = [pr(DAY0 + 11 * H)];
    }
    const [block] = layoutDay([s], DAY0);
    const moments = block ? blockMoments(block, 100, 198) : [];
    expect(moments.map((m) => [m.artifact.kind, m.y])).toEqual([
      ["pr", 100],
      ["commit", 100],
    ]);
  });

  test("skips moments without a time and keeps late ones on the bottom edge", () => {
    const [block] = placed(DAY0 + 10 * H, DAY0 + 11 * H, [commit(null), commit(DAY0 + 11.02 * H)]);
    expect(block ? blockMoments(block, 100, 98).map((m) => m.y) : []).toEqual([94]);
  });

  test("a block split at midnight shows each moment on its own day", () => {
    const artifacts = [commit(DAY0 + 23.5 * H, "before"), commit(DAY1 + 0.5 * H, "after")];
    const [late] = placed(DAY0 + 23 * H, DAY1 + H, artifacts);
    const [early] = placed(DAY0 + 23 * H, DAY1 + H, artifacts, DAY1);
    expect(late ? blockMoments(late, 100, 98).map((m) => m.artifact.ref) : []).toEqual(["before"]);
    expect(early ? blockMoments(early, 100, 98).map((m) => m.artifact.ref) : []).toEqual(["after"]);
  });
});

describe("momentRows", () => {
  const at = (...ys: number[]): Moment[] =>
    ys.map((y) => ({ artifact: { kind: "commit", ref: String(y), title: null, ts: 0 }, y }));

  test("centers each label on its moment and pushes overlapping ones down", () => {
    expect(momentRows(at(50, 55), 16, 200).map((r) => r.top)).toEqual([42, 58]);
  });

  test("labels near either edge stay inside the block", () => {
    expect(momentRows(at(2), 16, 200).map((r) => r.top)).toEqual([0]);
    expect(momentRows(at(199), 16, 200).map((r) => r.top)).toEqual([184]);
  });

  test("pulls labels crowding the bottom edge up instead of hiding them", () => {
    expect(momentRows(at(95, 98), 16, 100).map((r) => r.top)).toEqual([68, 84]);
  });

  test("replaces the last row that fits with a count of the rest", () => {
    const rows = momentRows(at(10, 20, 30, 40), 16, 40);
    expect(rows).toEqual([
      { kind: "moment", moment: at(10)[0] as Moment, top: 2 },
      { kind: "more", count: 3, top: 18 },
    ]);
  });
});

describe("momentMarks", () => {
  const at = (...ys: number[]): Moment[] =>
    ys.map((y, i) => ({ artifact: { kind: "commit", ref: String(i), title: null, ts: 0 }, y }));

  test("draws moments far enough apart as separate nodes", () => {
    expect(momentMarks(at(20, 40), 100)).toEqual([
      { top: 16.5, height: 7, count: 1, pr: false },
      { top: 36.5, height: 7, count: 1, pr: false },
    ]);
  });

  test("merges a run of close moments into one pill spanning them", () => {
    const [mark] = momentMarks(at(20, 26, 32), 100);
    expect(mark).toEqual({ top: 16.5, height: 19, count: 3, pr: false });
  });

  test("a burst at one minute still grows with its count, and a PR fills it", () => {
    const moments = at(50, 50, 50, 50);
    const pr = moments[1];
    if (pr) pr.artifact = { ...pr.artifact, kind: "pr" };
    expect(momentMarks(moments, 100)).toEqual([{ top: 42, height: 16, count: 4, pr: true }]);
  });

  test("keeps a pill inside the block", () => {
    const [mark] = momentMarks(at(94, 94, 94, 94, 94), 98);
    expect(mark && mark.top + mark.height).toBe(98);
  });
});

describe("clampInside", () => {
  test("keeps a value between the bounds", () => {
    expect(clampInside(5, 0, 10)).toBe(5);
    expect(clampInside(-3, 0, 10)).toBe(0);
    expect(clampInside(12, 0, 10)).toBe(10);
  });

  test("keeps to the low bound when the room is smaller than that", () => {
    expect(clampInside(7, 4, 2)).toBe(4);
  });
});

describe("pushDown / pullUp", () => {
  const row = (top: number) => ({ kind: "more" as const, count: 1, top });

  test("pushDown centers rows on their height and moves each below the one before", () => {
    expect(pushDown([row(50), row(55)], 16).map((r) => r.top)).toEqual([42, 58]);
  });

  test("pullUp keeps the last rows inside the bottom edge, each above the next", () => {
    expect(pullUp([row(80), row(90)], 16, 100).map((r) => r.top)).toEqual([68, 84]);
  });
});
