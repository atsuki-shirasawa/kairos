import { expect, test } from "bun:test";
import { keys, readKey } from "../../src/web/src/lib/queryKeys.ts";

test("readKey reads back every key the app builds", () => {
  expect(readKey(keys.calendar(1, 2))).toEqual({ kind: "calendar", from: 1, to: 2 });
  expect(readKey(keys.spans(1, 2))).toEqual({ kind: "spans", from: 1, to: 2 });
  expect(readKey(keys.recaps(1, 2))).toEqual({ kind: "recaps", from: 1, to: 2 });
  expect(readKey(keys.openItems(1, 2))).toEqual({ kind: "open-items", from: 1, to: 2 });
  expect(readKey(keys.pickUp)).toEqual({ kind: "pick-up" });
  expect(readKey(keys.projects)).toEqual({ kind: "projects" });
  expect(readKey(keys.search("q"))).toEqual({ kind: "search" });
  expect(readKey(keys.settings)).toEqual({ kind: "settings" });
  expect(readKey(keys.live)).toEqual({ kind: "live" });
  expect(readKey(keys.session("s"))).toEqual({ kind: "session", sessionId: "s" });
  expect(readKey(keys.messages("s", null))).toEqual({ kind: "messages", sessionId: "s" });
});

test("readKey knows no key the app doesn't build", () => {
  expect(readKey(["calendar"])).toBeNull();
  expect(readKey(["calendar", "spans"])).toBeNull();
  expect(readKey(["elsewhere", 1, 2])).toBeNull();
});

test("readKey reads every key in keys, so none is refetched on every event by mistake", () => {
  // Typed against keys, so a new builder is a type error here until it has an example
  const examples: { [K in keyof typeof keys]: readonly unknown[] } = {
    allCalendar: keys.allCalendar,
    calendar: keys.calendar(1, 2),
    projects: keys.projects,
    spans: keys.spans(1, 2),
    allSessions: keys.allSessions,
    session: keys.session("s"),
    allMessages: keys.allMessages("s"),
    messages: keys.messages("s", "a"),
    search: keys.search("q"),
    settings: keys.settings,
    live: keys.live,
    allRecaps: keys.allRecaps,
    recaps: keys.recaps(1, 2),
    allOpenItems: keys.allOpenItems,
    openItems: keys.openItems(1, 2),
    pickUp: keys.pickUp,
  };
  for (const [name, key] of Object.entries(examples)) {
    // The prefixes only select keys; no query is cached under one
    if (name.startsWith("all") && name !== "allMessages") continue;
    expect({ name, read: readKey(key) }).not.toEqual({ name, read: null });
  }
});
