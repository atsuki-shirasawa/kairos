import { describe, expect, test } from "bun:test";
import { blocksOfDay } from "../../src/web/src/lib/dayBlocks.ts";
import { layoutDay } from "../../src/web/src/lib/layout.ts";
import {
  blockArtifacts,
  blockMoments,
  clampInside,
  type Moment,
  momentMarks,
} from "../../src/web/src/lib/moments.ts";
import { DAY0, H, session as sessionOf } from "./helpers.ts";

const DAY1 = new Date(2026, 9, 6).getTime();

/** A finished session with one block per [start, end] span. */
const session = (id: string, spans: [number, number][]) => sessionOf(id, ...spans);

describe("blockArtifacts", () => {
  const artifact = (kind: "commit" | "pr", ts: number | null, ref: string) => ({
    kind,
    ref,
    title: null,
    ts,
  });
  /** The refs `blockArtifacts` keeps of a block from 10:00 to 11:00 (or into the next day). */
  const refsOn = (artifacts: ReturnType<typeof artifact>[], end = DAY0 + 11 * H, day = DAY0) => {
    const s = session("m", [[DAY0 + 10 * H, end]]);
    const seg = s.segments[0];
    if (seg) {
      seg.commits = artifacts.filter((a) => a.kind === "commit");
      seg.prs = artifacts.filter((a) => a.kind === "pr");
    }
    const [block] = blocksOfDay([s], day);
    return block ? blockArtifacts(block).map((a) => a.ref) : [];
  };

  test.each([
    ["before the block", [artifact("commit", DAY0 + 9 * H, "x")], []],
    ["without a time", [artifact("commit", null, "x")], []],
    [
      "recorded just after the end, in the server's grace",
      [artifact("commit", DAY0 + 11.02 * H, "late")],
      ["late"],
    ],
    [
      "in time order, a PR before a commit at the same minute",
      [
        artifact("commit", DAY0 + 10.5 * H, "c2"),
        artifact("commit", DAY0 + 10.2 * H, "c1"),
        artifact("pr", DAY0 + 10.5 * H, "p"),
      ],
      ["c1", "p", "c2"],
    ],
  ] as const)("%s", (_, artifacts, expected) => {
    expect(refsOn([...artifacts])).toEqual([...expected]);
  });

  test("a block running into the next day keeps each moment on its own day", () => {
    const artifacts = [
      artifact("commit", DAY0 + 23 * H, "today"),
      artifact("commit", DAY1 + H, "tomorrow"),
    ];
    expect(refsOn(artifacts, DAY1 + 2 * H)).toEqual(["today"]);
    expect(refsOn(artifacts, DAY1 + 2 * H, DAY1)).toEqual(["tomorrow"]);
  });
});

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
