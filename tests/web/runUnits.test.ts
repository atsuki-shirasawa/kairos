import { describe, expect, test } from "bun:test";
import { runCount, unitGroups, unitRef } from "../../src/web/src/lib/runUnits.ts";
import { at, session } from "./helpers.ts";

const unit = { id: "a", ref: 31 };
const of = (id: string, inUnit: typeof unit | null = unit) => ({
  session: { ...session(id, [at(9), at(9.1)]), headless: true, unit: inUnit },
});

describe("unitGroups", () => {
  test("gathers each unit's items in their order and leaves the rest out", () => {
    const [a, x, b] = [of("a"), of("x", null), of("b")];
    expect([...unitGroups([a, x, b])]).toEqual([["a", [a, b]]]);
  });
});

describe("unitRef", () => {
  test("is the unit's number only when every item is in it", () => {
    expect(unitRef([of("a"), of("b")])).toBe(31);
    expect(unitRef([of("a"), of("x", null)])).toBeNull();
    expect(unitRef([])).toBeNull();
  });
});

describe("runCount", () => {
  test("counts a session's blocks as one run", () => {
    expect(runCount([of("a"), of("a"), of("b")])).toBe(2);
  });
});
