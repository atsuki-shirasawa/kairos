import { describe, expect, test } from "bun:test";
import { runKindOf } from "../../../src/server/ingest/runKinds.ts";

const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();

describe("runKindOf", () => {
  test("runs on one day that made nothing are trials", () => {
    const runs = [at(5, 9), at(5, 9), at(5, 23)].map((t) => ({ startedAt: t, made: false }));
    expect(runKindOf(runs)).toBe("trial");
  });

  test("runs coming back on another local day are automation", () => {
    const runs = [at(5, 9), at(6, 9)].map((t) => ({ startedAt: t, made: false }));
    expect(runKindOf(runs)).toBe("automation");
  });

  test("a sitting of probes across midnight is still trials", () => {
    const runs = [at(5, 23), at(6, 0)].map((t) => ({ startedAt: t, made: false }));
    expect(runKindOf(runs)).toBe("trial");
  });

  test("one run that made a commit or PR makes the directory automation", () => {
    expect(runKindOf([{ startedAt: at(5, 9), made: true }])).toBe("automation");
    expect(
      runKindOf([
        { startedAt: at(5, 9), made: false },
        { startedAt: at(5, 10), made: true },
      ]),
    ).toBe("automation");
  });

  test("a run with no start time adds no day", () => {
    expect(
      runKindOf([
        { startedAt: null, made: false },
        { startedAt: at(5, 9), made: false },
      ]),
    ).toBe("trial");
  });
});
