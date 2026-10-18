import { expect, test } from "bun:test";
import {
  journalPath,
  readSessionTarget,
  readUiPath,
  uiLinkPath,
  writeSessionTarget,
} from "../../src/shared/uiUrl.ts";
import { parseUrlState } from "../../src/web/src/lib/urlState.ts";

const NOW = new Date(2026, 9, 13, 15, 30).getTime();

test("uiLinkPath opens a day in the Journal's day view, and a session at a section", () => {
  expect(uiLinkPath({})).toBe("/");
  expect(uiLinkPath({ day: new Date(2026, 9, 1, 18).getTime() })).toBe(
    "/journal/2026-10-01?view=day",
  );
  expect(uiLinkPath({ day: new Date(2026, 9, 1).getTime(), session: "abc", start: 42 })).toBe(
    "/journal/2026-10-01?view=day&session=abc&at=42",
  );
  // Without a day, the drawer opens over Today
  expect(uiLinkPath({ session: "abc" })).toBe("/today?session=abc");
});

test("the section is left out without a session", () => {
  expect(uiLinkPath({ start: 42 })).toBe("/");
  const q = new URLSearchParams();
  writeSessionTarget({ session: null, at: 42 }, q);
  expect(q.size).toBe(0);
});

test("readSessionTarget reads back what writeSessionTarget wrote, and drops a bad section", () => {
  const q = new URLSearchParams();
  writeSessionTarget({ session: "abc", at: 42 }, q);
  expect(readSessionTarget(q)).toEqual({ session: "abc", at: 42 });
  expect(readSessionTarget(new URLSearchParams("session=abc&at=x"))).toEqual({
    session: "abc",
    at: null,
  });
  expect(readSessionTarget(new URLSearchParams())).toEqual({ session: null, at: null });
});

test("readUiPath names Today and the Journal's day, and nothing else", () => {
  expect(readUiPath("/today")).toEqual({ page: "today" });
  expect(readUiPath("/today/")).toEqual({ page: "today" });
  expect(readUiPath("/journal")).toEqual({ page: "journal", date: null });
  expect(readUiPath("/journal/2026-10-01")).toEqual({ page: "journal", date: "2026-10-01" });
  expect(readUiPath(journalPath(new Date(2026, 9, 1, 18).getTime()))).toEqual({
    page: "journal",
    date: "2026-10-01",
  });
  for (const p of [
    "/",
    "/api/health",
    "/journal/x",
    "/journal/2026-10-01/x",
    "/todays",
    "/assets/a.js",
  ])
    expect(readUiPath(p)).toBeNull();
});

test("a link the CLI builds opens that day, session and section in the web app", () => {
  const day = new Date(2026, 9, 1).getTime();
  const state = parseUrlState(uiLinkPath({ day: day + 5_000, session: "abc", start: 42 }), NOW);
  expect(state).toMatchObject({
    view: "day",
    layout: "calendar",
    anchor: day,
    session: "abc",
    at: 42,
    sort: { key: "start", desc: false },
  });
  expect(parseUrlState(uiLinkPath({ session: "abc" }), NOW)).toMatchObject({
    layout: "today",
    session: "abc",
  });
});
