import { describe, expect, test } from "bun:test";
import { NO_FILTER } from "../../src/web/src/lib/filter.ts";
import {
  DEFAULT_SORT,
  isNewPlace,
  parseUrlState,
  serializeUrlState,
  type UrlState,
} from "../../src/web/src/lib/urlState.ts";

const NOW = new Date(2026, 9, 13, 15, 30).getTime();
const TODAY = new Date(2026, 9, 13).getTime();

const DEFAULTS: UrlState = {
  view: "week",
  layout: "today",
  anchor: TODAY,
  session: null,
  at: null,
  sort: DEFAULT_SORT,
  filter: NO_FILTER,
};

const parse = (href: string) => parseUrlState(href, NOW);
const serialize = (patch: Partial<UrlState>) => serializeUrlState({ ...DEFAULTS, ...patch }, NOW);
const OCT_1 = new Date(2026, 9, 1).getTime();

describe("parseUrlState", () => {
  test("Today's path and the root are Today, with the week of today in time order behind it", () => {
    expect(parse("/today")).toEqual(DEFAULTS);
    expect(parse("/")).toEqual(DEFAULTS);
    expect(parse("/today?session=abc&at=42")).toEqual({ ...DEFAULTS, session: "abc", at: 42 });
  });

  test("the Journal's path names the day, and its tab the layout", () => {
    expect(parse("/journal")).toEqual({ ...DEFAULTS, layout: "calendar" });
    expect(parse("/journal/2026-10-01?view=day")).toEqual({
      ...DEFAULTS,
      layout: "calendar",
      view: "day",
      anchor: OCT_1,
    });
    expect(parse("/journal?tab=insights").layout).toBe("summary");
    expect(parse("/journal?tab=table").layout).toBe("table");
    expect(parse("/journal?tab=grid").layout).toBe("calendar");
  });

  test("invalid values fall back to the defaults", () => {
    expect(parse("/journal/2026-13-45?view=year&at=x&sort=Cost!")).toEqual({
      ...DEFAULTS,
      layout: "calendar",
    });
    expect(parse("/journal?sort=start").sort).toEqual(DEFAULT_SORT);
    expect(parse("/journal?sort=-start").sort).toEqual(DEFAULT_SORT);
  });

  test("reads every parameter", () => {
    expect(
      parse("/journal/2026-09-30?view=month&tab=insights&session=abc&at=42&sort=-cost&q=fix"),
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

  test("an old link in the root's query opens what it did", () => {
    expect(parse("/?view=day&date=2026-10-01&session=abc&at=42")).toEqual({
      ...DEFAULTS,
      layout: "calendar",
      view: "day",
      anchor: OCT_1,
      session: "abc",
      at: 42,
    });
    expect(parse("/?layout=list&date=2026-10-01").layout).toBe("table");
    expect(parse("/?layout=live").layout).toBe("today");
    // Any path the app doesn't know reads its query the same way
    expect(parse("/index.html?layout=summary").layout).toBe("summary");
  });
});

describe("serializeUrlState", () => {
  test("defaults are left out", () => {
    expect(serialize({})).toBe("/today");
    expect(serialize({ layout: "calendar" })).toBe("/journal");
    expect(serialize({ layout: "calendar", anchor: NOW })).toBe("/journal");
  });

  test("Today writes no period, only the open block", () => {
    expect(serialize({ view: "day", anchor: OCT_1 })).toBe("/today");
    expect(serialize({ session: "abc" })).toBe("/today?session=abc");
    expect(
      serialize({ sort: { key: "cost", desc: true }, filter: { ...NO_FILTER, q: "fix" } }),
    ).toBe("/today");
  });

  test("writes the Journal's day in the path and parameters in a fixed order", () => {
    expect(
      serialize({
        view: "day",
        layout: "table",
        anchor: OCT_1,
        session: "abc",
        at: 42,
        sort: { key: "cost", desc: false },
        filter: { ...NO_FILTER, q: "fix" },
      }),
    ).toBe("/journal/2026-10-01?view=day&tab=table&session=abc&at=42&sort=cost&q=fix");
  });

  test("a section without a session is left out", () => {
    expect(serialize({ at: 42 })).toBe("/today");
  });
});

test("state survives a round trip through the URL", () => {
  const states: UrlState[] = [
    DEFAULTS,
    { ...DEFAULTS, view: "month", layout: "calendar", anchor: new Date(2025, 11, 31).getTime() },
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

describe("isNewPlace", () => {
  const base: UrlState = { ...DEFAULTS, anchor: TODAY };
  const day = (d: number) => new Date(2026, 9, d).getTime();

  test("a step to another period is a new place", () => {
    expect(isNewPlace(base, { ...base, anchor: day(20) })).toBe(true);
  });

  test("another day in the same week is not", () => {
    // Oct 13 (Tue) and Oct 15 (Thu) are in the week starting Sunday Oct 11
    expect(isNewPlace(base, { ...base, anchor: day(15) })).toBe(false);
  });

  test("switching the view or the layout is a new place", () => {
    expect(isNewPlace(base, { ...base, view: "day" })).toBe(true);
    expect(isNewPlace(base, { ...base, layout: "summary" })).toBe(true);
  });

  test("selecting a block, filtering or sorting stays in place", () => {
    expect(isNewPlace(base, { ...base, session: "s", at: NOW })).toBe(false);
    expect(isNewPlace(base, { ...base, filter: { ...base.filter, q: "fix" } })).toBe(false);
    expect(isNewPlace(base, { ...base, sort: { key: "start", desc: true } })).toBe(false);
  });
});
