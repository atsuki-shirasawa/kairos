import { describe, expect, test } from "bun:test";
import { NO_FILTER } from "../../src/web/src/lib/filter.ts";
import {
  DEFAULT_SORT,
  parseUrlState,
  serializeUrlState,
  type UrlState,
} from "../../src/web/src/lib/urlState.ts";

const NOW = new Date(2026, 9, 13, 15, 30).getTime();
const TODAY = new Date(2026, 9, 13).getTime();

const DEFAULTS: UrlState = {
  view: "week",
  layout: "calendar",
  anchor: TODAY,
  session: null,
  at: null,
  sort: DEFAULT_SORT,
  filter: NO_FILTER,
};

const parse = (search: string) => parseUrlState(new URLSearchParams(search), NOW);
const serialize = (patch: Partial<UrlState>) =>
  serializeUrlState({ ...DEFAULTS, ...patch }, NOW).toString();

describe("parseUrlState", () => {
  test("an empty query is the week calendar of today in time order", () => {
    expect(parse("")).toEqual(DEFAULTS);
  });

  test("invalid values fall back to the defaults", () => {
    expect(parse("view=year&layout=grid&date=2026-1-5&at=x&sort=Cost!")).toEqual(DEFAULTS);
    expect(parse("sort=start").sort).toEqual(DEFAULT_SORT);
    expect(parse("sort=-start").sort).toEqual(DEFAULT_SORT);
  });

  test("reads every parameter", () => {
    expect(
      parse("view=month&layout=summary&date=2026-09-30&session=abc&at=42&sort=-cost&q=fix"),
    ).toEqual({
      view: "month",
      layout: "summary",
      anchor: new Date(2026, 8, 30).getTime(),
      session: "abc",
      at: 42,
      sort: { key: "cost", desc: true },
      filter: { ...NO_FILTER, q: "fix" },
    });
  });
});

describe("serializeUrlState", () => {
  test("defaults are left out", () => {
    expect(serialize({})).toBe("");
    expect(serialize({ anchor: NOW })).toBe("");
  });

  test("writes parameters in a fixed order", () => {
    expect(
      serialize({
        view: "day",
        layout: "list",
        anchor: new Date(2026, 9, 1).getTime(),
        session: "abc",
        at: 42,
        sort: { key: "cost", desc: false },
        filter: { ...NO_FILTER, q: "fix" },
      }),
    ).toBe("view=day&layout=list&date=2026-10-01&session=abc&at=42&sort=cost&q=fix");
  });

  test("a section without a session is left out", () => {
    expect(serialize({ at: 42 })).toBe("");
  });
});

test("state survives a round trip through the URL", () => {
  const states: UrlState[] = [
    DEFAULTS,
    { ...DEFAULTS, view: "month", layout: "live", anchor: new Date(2025, 11, 31).getTime() },
    {
      view: "day",
      layout: "summary",
      anchor: new Date(2026, 0, 2).getTime(),
      session: "s-1",
      at: 1_700_000_000_000,
      sort: { key: "tokens", desc: true },
      filter: { ...NO_FILTER, q: "a b&c", qFiles: true, outcomes: ["pr"], branch: "main" },
    },
  ];
  for (const s of states) expect(parseUrlState(serializeUrlState(s, NOW), NOW)).toEqual(s);
});
