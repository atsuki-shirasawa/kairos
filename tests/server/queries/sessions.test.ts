import { describe, expect, test } from "bun:test";
import {
  hasSection,
  hasSession,
  sessionDetail,
  sessionsChange,
} from "../../../src/server/queries/sessions.ts";
import { NO_SUMMARIES } from "../../../src/server/queries/summaryState.ts";
import { SID } from "../../fixtures/ids.ts";
import { min, setup } from "../ingest/helpers.ts";

describe("existence checks", () => {
  const { db, ingester } = setup();
  ingester.scan();

  test("hasSession answers as loading the session would", () => {
    expect(hasSession(db, SID.basic)).toBe(true);
    expect(hasSession(db, "nope")).toBe(false);
  });

  test("hasSection matches only a section's exact start", () => {
    const starts = sessionDetail(db, SID.basic, {
      now: 0,
      summaries: NO_SUMMARIES,
      visible: "1",
    })?.sections.map((s) => s.start);
    expect(starts).toContain(min(0));
    for (const start of starts ?? []) expect(hasSection(db, SID.basic, start)).toBe(true);
    expect(hasSection(db, SID.basic, min(0) + 1)).toBe(false);
    expect(hasSection(db, SID.basic, Number.NaN)).toBe(false);
    expect(hasSection(db, "nope", min(0))).toBe(false);
  });
});

describe("sessionsChange", () => {
  const { db, ingester } = setup();
  ingester.scan();
  const span = (id: string) =>
    db
      .query<{ started_at: number; ended_at: number }, [string]>(
        "SELECT started_at, ended_at FROM sessions WHERE id = ?",
      )
      .get(id);

  test("spans the changed sessions' time", () => {
    const basic = span(SID.basic);
    expect(sessionsChange(db, [SID.basic])).toEqual({
      ids: [SID.basic],
      from: basic?.started_at ?? -1,
      to: basic?.ended_at ?? -1,
    });
  });

  test("reaches back over the session a continuation continues, whose mark changes", () => {
    const before = span(SID.continuedFrom);
    expect(sessionsChange(db, [SID.continuedTo]).from).toBe(before?.started_at ?? -1);
  });

  test("a change to sessions that are gone spans all time", () => {
    expect(sessionsChange(db, ["gone"])).toEqual({
      ids: ["gone"],
      from: 0,
      to: Number.MAX_SAFE_INTEGER,
    });
  });
});
