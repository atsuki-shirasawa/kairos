import { describe, expect, test } from "bun:test";
import { NO_FILTER } from "../../src/web/src/lib/filter.ts";
import {
  DEFAULT_SORT,
  openThread,
  parseUrlState,
  serializeUrlState,
  startsNewEntry,
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
  thread: null,
};

const parse = (href: string) => parseUrlState(href, NOW);
const serialize = (patch: Partial<UrlState>) => serializeUrlState({ ...DEFAULTS, ...patch }, NOW);
const OCT_1 = new Date(2026, 9, 1).getTime();

describe("parseUrlState", () => {
  test("Today's path and the root are Today, with the week of today in time order behind it", () => {
    expect(parse("/today")).toEqual(DEFAULTS);
    expect(parse("/")).toEqual(DEFAULTS);
    expect(parse("/today?session=abc&at=42")).toEqual({ ...DEFAULTS, session: "abc", at: 42 });
    // Today keeps no period, so it reads none it couldn't write back
    expect(parse("/today?view=day&q=fix&sort=-cost")).toEqual(DEFAULTS);
    expect(parse("/?layout=live&view=month&q=x&session=abc")).toEqual({
      ...DEFAULTS,
      session: "abc",
    });
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
      thread: null,
    });
  });

  test("a thread's path names the session it was opened from, and the open block rides along", () => {
    expect(parse("/thread/abc?session=def&at=7")).toEqual({
      ...DEFAULTS,
      layout: "thread",
      thread: "abc",
      session: "def",
      at: 7,
    });
    expect(serialize({ ...openThread("a b"), layout: "thread" })).toBe("/thread/a%20b");
    // A thread with no session is nowhere to go, so it reads and writes as Today
    expect(parse("/thread/").layout).toBe("today");
    expect(serialize({ layout: "thread", thread: null })).toBe("/today");
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
      thread: null,
    },
    { ...DEFAULTS, layout: "thread", thread: "s/1 é", session: "s-2", at: 5 },
  ];
  for (const s of states) expect(parseUrlState(serializeUrlState(s, NOW), NOW)).toEqual(s);
});

describe("startsNewEntry", () => {
  const base: UrlState = { ...DEFAULTS, anchor: TODAY };
  const day = (d: number) => new Date(2026, 9, d).getTime();

  test("a step to another period is a new place", () => {
    expect(startsNewEntry(base, { ...base, anchor: day(20) })).toBe(true);
  });

  test("another day in the same week is not", () => {
    // Oct 13 (Tue) and Oct 15 (Thu) are in the week starting Sunday Oct 11
    expect(startsNewEntry(base, { ...base, anchor: day(15) })).toBe(false);
  });

  test("switching the view or the layout is a new place", () => {
    expect(startsNewEntry(base, { ...base, view: "day" })).toBe(true);
    expect(startsNewEntry(base, { ...base, layout: "summary" })).toBe(true);
  });

  test("selecting a block, filtering or sorting stays in place", () => {
    expect(startsNewEntry(base, { ...base, session: "s", at: NOW })).toBe(false);
    expect(startsNewEntry(base, { ...base, filter: { ...base.filter, q: "fix" } })).toBe(false);
    expect(startsNewEntry(base, { ...base, sort: { key: "start", desc: true } })).toBe(false);
    // Another thread is another page; a block opened over it isn't
    const thread = { ...base, ...openThread("a") };
    expect(startsNewEntry(thread, { ...thread, thread: "b" })).toBe(true);
    expect(startsNewEntry(thread, { ...thread, session: "a", at: 1 })).toBe(false);
  });
});
