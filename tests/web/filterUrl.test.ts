import { describe, expect, test } from "bun:test";
import { type Filter, NO_FILTER } from "../../src/web/src/lib/filter.ts";
import { readFilter, writeFilter } from "../../src/web/src/lib/filterUrl.ts";

describe("URL parameters", () => {
  const read = (search: string) => readFilter(new URLSearchParams(search));
  const write = (f: Filter) => {
    const q = new URLSearchParams();
    writeFilter(f, q);
    return q.toString();
  };

  test("round-trips every condition, in a fixed order", () => {
    const f: Filter = {
      q: "login",
      qFiles: true,
      outcomes: ["merge", "commit"],
      states: ["snag", "active"],
      minMinutes: 60,
      branch: "feature/login",
      hideBrief: true,
    };
    const search = write(f);
    expect(search).toBe(
      "q=login&in=files&outcome=commit%2Cmerge&state=active%2Csnag&len=60&branch=feature%2Flogin&brief=hide",
    );
    expect(read(search)).toEqual({
      ...f,
      outcomes: ["commit", "merge"],
      states: ["active", "snag"],
    });
  });

  test("no conditions write nothing", () => {
    expect(write(NO_FILTER)).toBe("");
    expect(read("")).toEqual(NO_FILTER);
  });

  test("the old outcome=1 switch means a commit or PR", () => {
    expect(read("outcome=1").outcomes).toEqual(["commit", "pr"]);
  });

  test("unknown values are dropped", () => {
    expect(read("outcome=deploy,pr&state=bogus&len=45")).toMatchObject({
      outcomes: ["pr"],
      states: [],
      minMinutes: 0,
    });
  });
});
