import { describe, expect, test } from "bun:test";
import { runNumbers, runUnits, type UnitRun } from "../../../src/server/ingest/runUnits.ts";

describe("runNumbers", () => {
  test("takes the numbers a report names, PR URLs too, and the block refs' numbers", () => {
    expect(runNumbers("loop: opened https://github.com/me/app/pull/32 for #31", [32, 40])).toEqual([
      31, 32, 40,
    ]);
    expect(runNumbers("loop: answered 1 finding(s) on 4d5e6f7", [])).toEqual([]);
    expect(runNumbers(null, [7])).toEqual([7]);
    // The rest of a report may name the next issue, which would tie the next run in
    expect(runNumbers("loop: declared 4d5e6f7 for #31\n\nNext up is #33.", [])).toEqual([31]);
  });
});

describe("runUnits", () => {
  const run = (id: string, ...numbers: number[]): UnitRun => ({ id, numbers });
  const units = (...runs: UnitRun[]) => Object.fromEntries(runUnits(runs));

  test("ties runs that name a number the unit before them named", () => {
    expect(units(run("a", 31), run("b", 32, 31), run("c", 32), run("d", 35))).toEqual({
      a: { id: "a", ref: 31 },
      b: { id: "a", ref: 31 },
      c: { id: "a", ref: 31 },
      d: null,
    });
  });

  test("a run that names no number stays alone and doesn't end the unit", () => {
    expect(units(run("a", 31), run("x"), run("b", 31))).toEqual({
      a: { id: "a", ref: 31 },
      x: null,
      b: { id: "a", ref: 31 },
    });
  });

  test("ties by the first run's number when it can, whatever order a report names them in", () => {
    expect(units(run("a", 31), run("b", 32, 31)).b).toEqual({ id: "a", ref: 31 });
  });

  test("a run rejoins the latest unit it names a number of, though the loop moved on since", () => {
    // A reply to #32's review after the loop took up #35, and a second try at #35
    expect(units(run("a", 31), run("b", 32, 31), run("c", 35), run("d", 32), run("e", 35))).toEqual(
      {
        a: { id: "a", ref: 31 },
        b: { id: "a", ref: 31 },
        c: { id: "c", ref: 35 },
        d: { id: "a", ref: 31 },
        e: { id: "c", ref: 35 },
      },
    );
  });
});
