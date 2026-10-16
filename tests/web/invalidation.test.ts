import { describe, expect, test } from "bun:test";
import type { CalendarResponse } from "../../src/shared/api.ts";
import { isStaleAfter, type UpdateEvent } from "../../src/web/src/lib/invalidation.ts";
import { keys } from "../../src/web/src/lib/queryKeys.ts";

/** Sessions `a` and `b` changed, spanning [1000, 2000]. */
const change: UpdateEvent = { type: "sessions.updated", ids: ["a", "b"], from: 1000, to: 2000 };

/** A cached calendar response with these nearest blocks outside its period. */
const calendar = (prev: number | null, next: number | null): CalendarResponse => ({
  from: 0,
  to: 0,
  sessions: [],
  prev,
  next,
});

describe("sessions.updated", () => {
  const stale = (key: readonly unknown[], data?: unknown) => isStaleAfter(change, key, data);

  test("refetches the periods its time meets, and only those", () => {
    for (const k of [keys.spans, keys.recaps, keys.openItems]) {
      expect(stale(k(1500, 1600))).toBe(true);
      expect(stale(k(0, 1001))).toBe(true);
      // A block ending exactly at a period's start shows in it
      expect(stale(k(2000, 3000))).toBe(true);
      expect(stale(k(0, 1000))).toBe(false);
      expect(stale(k(2001, 3000))).toBe(false);
    }
  });

  test("leaves search alone, which covers every period", () => {
    expect(stale(keys.search("deploy"))).toBe(false);
    expect(stale(keys.settings)).toBe(false);
  });

  test("refetches the changed sessions' drawers and conversations, not the others'", () => {
    expect(stale(keys.session("a"))).toBe(true);
    expect(stale(keys.messages("b", "agent"))).toBe(true);
    expect(stale(keys.session("c"))).toBe(false);
    expect(stale(keys.messages("c", null))).toBe(false);
  });

  test("refetches the projects and the live page", () => {
    expect(stale(keys.projects)).toBe(true);
    expect(stale(keys.live)).toBe(true);
  });

  test("refetches a calendar period it overlaps", () => {
    expect(stale(keys.calendar(1500, 1600), calendar(1, 5000))).toBe(true);
  });

  test("refetches an earlier period whose next block it may come before", () => {
    expect(stale(keys.calendar(0, 500), calendar(null, null))).toBe(true);
    expect(stale(keys.calendar(0, 500), calendar(null, 1500))).toBe(true);
    expect(stale(keys.calendar(0, 500), calendar(null, 900))).toBe(false);
  });

  test("refetches a later period whose previous block it may come after", () => {
    expect(stale(keys.calendar(3000, 4000), calendar(null, null))).toBe(true);
    expect(stale(keys.calendar(3000, 4000), calendar(1500, null))).toBe(true);
    expect(stale(keys.calendar(3000, 4000), calendar(2500, null))).toBe(false);
  });

  test("refetches a calendar period not loaded yet", () => {
    expect(stale(keys.calendar(0, 500))).toBe(true);
  });
});

describe("other events", () => {
  test("live.updated refetches only the live page", () => {
    const e: UpdateEvent = { type: "live.updated" };
    expect(isStaleAfter(e, keys.live, undefined)).toBe(true);
    expect(isStaleAfter(e, keys.calendar(0, 1), undefined)).toBe(false);
    expect(isStaleAfter(e, keys.session("a"), undefined)).toBe(false);
  });

  test("recap.updated refetches only recaps", () => {
    const e: UpdateEvent = { type: "recap.updated", projectId: 1, from: 0, to: 1 };
    expect(isStaleAfter(e, keys.recaps(5, 6), undefined)).toBe(true);
    expect(isStaleAfter(e, keys.calendar(0, 1), undefined)).toBe(false);
  });

  test("summary.updated refetches every period's data and every drawer", () => {
    const e: UpdateEvent = { type: "summary.updated", sessionId: "a", start: 1 };
    for (const key of [
      keys.calendar(0, 1),
      keys.search("x"),
      keys.openItems(0, 1),
      keys.session("z"),
    ])
      expect(isStaleAfter(e, key, undefined)).toBe(true);
    expect(isStaleAfter(e, keys.live, undefined)).toBe(false);
    expect(isStaleAfter(e, keys.messages("a", null), undefined)).toBe(false);
  });

  test("a key the app doesn't build is refetched", () => {
    expect(isStaleAfter(change, ["unknown"], undefined)).toBe(true);
  });
});
