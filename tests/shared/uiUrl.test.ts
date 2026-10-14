import { expect, test } from "bun:test";
import { readSessionTarget, uiLinkQuery, writeSessionTarget } from "../../src/shared/uiUrl.ts";
import { parseUrlState } from "../../src/web/src/lib/urlState.ts";

const NOW = new Date(2026, 9, 13, 15, 30).getTime();

test("uiLinkQuery opens a day in the day view and a session at a section", () => {
  expect(uiLinkQuery({}).toString()).toBe("");
  expect(uiLinkQuery({ day: new Date(2026, 9, 1, 18).getTime() }).toString()).toBe(
    "view=day&date=2026-10-01",
  );
  expect(
    uiLinkQuery({ day: new Date(2026, 9, 1).getTime(), session: "abc", start: 42 }).toString(),
  ).toBe("view=day&date=2026-10-01&session=abc&at=42");
});

test("the section is left out without a session", () => {
  expect(uiLinkQuery({ start: 42 }).toString()).toBe("");
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

test("a link the CLI builds opens that day, session and section in the web app", () => {
  const day = new Date(2026, 9, 1).getTime();
  const state = parseUrlState(uiLinkQuery({ day: day + 5_000, session: "abc", start: 42 }), NOW);
  expect(state).toMatchObject({
    view: "day",
    layout: "calendar",
    anchor: day,
    session: "abc",
    at: 42,
    sort: { key: "start", desc: false },
  });
});
