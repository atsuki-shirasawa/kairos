import { describe, expect, test } from "bun:test";
import { hasSection, hasSession, sessionDetail } from "../../../src/server/queries/sessions.ts";
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
    const starts = sessionDetail(db, SID.basic, 0, NO_SUMMARIES)?.sections.map((s) => s.start);
    expect(starts).toContain(min(0));
    for (const start of starts ?? []) expect(hasSection(db, SID.basic, start)).toBe(true);
    expect(hasSection(db, SID.basic, min(0) + 1)).toBe(false);
    expect(hasSection(db, SID.basic, Number.NaN)).toBe(false);
    expect(hasSection(db, "nope", min(0))).toBe(false);
  });
});
