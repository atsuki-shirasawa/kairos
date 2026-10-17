import { describe, expect, test } from "bun:test";
import type { Project } from "../../src/shared/api.ts";
import { DAY } from "../../src/shared/dates.ts";
import { lastWorkday, workdayByProject } from "../../src/web/src/lib/today.ts";
import { at, DAY0, session } from "./helpers.ts";

const project = (id: number, hidden = false): Project => ({
  id,
  path: `/p${id}`,
  name: `p${id}`,
  repo: null,
  color: null,
  hidden,
});
const PROJECTS = new Map([
  [1, project(1)],
  [2, project(2)],
  [3, project(3, true)],
]);

describe("lastWorkday", () => {
  const span = (start: number, end: number, projectId: number | null = 1) => ({
    start,
    end,
    projectId,
  });
  const TODAY = DAY0 + 3 * DAY;

  test("is the day the latest work before today started on", () => {
    expect(lastWorkday([span(at(9), at(10)), span(at(24 + 9), at(24 + 11))], TODAY, PROJECTS)).toBe(
      DAY0 + DAY,
    );
  });

  test("work running past midnight into today belongs to the day it began", () => {
    expect(lastWorkday([span(at(48 + 22), at(72 + 0.5))], TODAY, PROJECTS)).toBe(DAY0 + 2 * DAY);
  });

  test("skips quick questions, hidden projects and today, as the list would", () => {
    const spans = [
      span(at(9), at(10)),
      span(at(24 + 9), at(24 + 9.05)),
      span(at(48 + 9), at(48 + 11), 3),
      span(at(72 + 9), at(72 + 11)),
    ];
    expect(lastWorkday(spans, TODAY, PROJECTS)).toBe(DAY0);
    expect(lastWorkday([], TODAY, PROJECTS)).toBeNull();
  });
});

describe("workdayByProject", () => {
  test("groups the day's blocks by project, the busiest first, each in time order", () => {
    const a = session("a", [at(9), at(10)], [at(14), at(16)]);
    const b = { ...session("b", [at(11), at(11.5)]), projectId: 2 };
    expect(workdayByProject([a, b], DAY0, PROJECTS)).toEqual([
      {
        projectId: 1,
        ms: 3 * 3_600_000,
        blocks: [
          { sessionId: "a", start: at(9), headline: "a", commits: 0, prs: 0 },
          { sessionId: "a", start: at(14), headline: "a", commits: 0, prs: 0 },
        ],
      },
      {
        projectId: 2,
        ms: 0.5 * 3_600_000,
        blocks: [{ sessionId: "b", start: at(11), headline: "b", commits: 0, prs: 0 }],
      },
    ]);
  });

  test("leaves out quick questions, hidden projects and other days", () => {
    const quick = session("quick", [at(9), at(9.05)]);
    const hidden = { ...session("hidden", [at(10), at(12)]), projectId: 3 };
    const tomorrow = session("tomorrow", [at(30), at(32)]);
    expect(workdayByProject([quick, hidden, tomorrow], DAY0, PROJECTS)).toEqual([]);
  });

  test("leaves work that began the evening before to that day", () => {
    const overnight = session("overnight", [at(-2), at(1.5)]);
    const morning = session("morning", [at(10), at(12)]);
    expect(
      workdayByProject([overnight, morning], DAY0, PROJECTS).flatMap((p) =>
        p.blocks.map((b) => b.sessionId),
      ),
    ).toEqual(["morning"]);
  });

  test("counts the commits and PRs each block made", () => {
    const s = session("s", [at(9), at(10)]);
    const seg = s.segments[0];
    if (!seg) throw new Error("no segment");
    const commit = { kind: "commit" as const, ref: "abc", title: null, ts: at(9.5) };
    const pr = { kind: "pr" as const, ref: "https://example.test/pr/1", title: null, ts: at(9.6) };
    s.segments[0] = { ...seg, commits: [commit, commit], prs: [pr] };
    expect(workdayByProject([s], DAY0, PROJECTS)[0]?.blocks[0]).toMatchObject({
      commits: 2,
      prs: 1,
    });
  });
});
