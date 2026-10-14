import { describe, expect, test } from "bun:test";
import type { CalendarSession } from "../../src/shared/api.ts";
import { layoutDay } from "../../src/web/src/lib/layout.ts";
import { isMark, runGroups } from "../../src/web/src/lib/marks.ts";
import { at, DAY0, session } from "./helpers.ts";

describe("isMark", () => {
  const DAY = 86_400_000;
  const block = (s: CalendarSession, i = 0) => {
    const segment = s.segments[i];
    if (!segment) throw new Error("no such block");
    return { session: s, segment };
  };

  test("short work is a mark; ten minutes or more is a card", () => {
    expect(isMark(block(session("q", [at(9), at(9.15)])))).toBe(true);
    expect(isMark(block(session("w", [at(9), at(9 + 10 / 60)])))).toBe(false);
  });

  test("judges a block crossing midnight by its whole length", () => {
    const s = session("late", [at(23.9), at(24.5)]);
    expect(isMark(block(s))).toBe(false);
    expect(layoutDay([s], DAY0 + DAY)[0]?.mark).toBe(false);
  });

  test("the work in progress stays a card while it is still short", () => {
    const s = { ...session("now", [at(8), at(9)], [at(10), at(10.05)]), active: true };
    expect(isMark(block(s, 1))).toBe(false);
    // Its earlier short block, if any, would still be a mark; here the first is an hour long
    expect(isMark(block(s, 0))).toBe(false);
  });
});

describe("runGroups", () => {
  const sec = (h: number, m: number, s = 0) => at(h + m / 60 + s / 3600);
  const mark = (s: CalendarSession) => {
    const [segment] = s.segments;
    if (!segment) throw new Error("a session without blocks");
    return { session: s, segment };
  };
  /** A headless run of `project` lasting five seconds from `start`. */
  const run = (id: string, start: number, projectId: number | null = 1) => {
    const s = { ...session(id, [start, start + 5_000]), headless: true, projectId };
    return mark(s);
  };
  const ids = (groups: ReturnType<typeof runGroups<ReturnType<typeof run>>>) =>
    groups.map((g) => g.map((m) => m.session.id));

  test("runs of a project seconds apart become one group", () => {
    const marks = [run("a", sec(10, 25)), run("b", sec(10, 25, 20)), run("c", sec(10, 26))];
    expect(ids(runGroups(marks))).toEqual([["a", "b", "c"]]);
  });

  test("a pause longer than five minutes starts a new group", () => {
    const marks = [run("a", sec(10, 25)), run("b", sec(10, 31)), run("c", sec(10, 35))];
    expect(ids(runGroups(marks))).toEqual([["a"], ["b", "c"]]);
  });

  test("a burst ends fifteen minutes after its first run, however close the runs", () => {
    const marks = [0, 4, 8, 12, 16, 20].map((m, i) => run(`r${i}`, sec(9, m)));
    expect(ids(runGroups(marks))).toEqual([
      ["r0", "r1", "r2", "r3"],
      ["r4", "r5"],
    ]);
  });

  test("measures the pause from the run that ends last, not the one that started last", () => {
    const long = { ...session("long", [sec(10, 0), sec(10, 4)]), headless: true };
    const marks = [mark(long), run("short", sec(10, 0, 10)), run("next", sec(10, 8))];
    expect(ids(runGroups(marks))).toEqual([["long", "short", "next"]]);
  });

  test("runs with no project are never grouped", () => {
    const marks = [run("a", sec(10, 25), null), run("b", sec(10, 25, 20), null)];
    expect(ids(runGroups(marks))).toEqual([["a"], ["b"]]);
  });

  test("other projects and prompted work stay on their own without breaking a burst", () => {
    const asked = session("asked", [sec(10, 25, 30), sec(10, 26)]);
    const marks = [
      run("a", sec(10, 25)),
      mark(asked),
      run("other", sec(10, 25, 40), 2),
      run("b", sec(10, 26, 10)),
    ];
    expect(ids(runGroups(marks))).toEqual([["a", "b"], ["asked"], ["other"]]);
  });
});
