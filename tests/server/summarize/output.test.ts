import { describe, expect, test } from "bun:test";
import {
  MAX_OPEN,
  readSummary,
  readTitle,
  renderBody,
  SUMMARY_SCHEMA,
  type SummaryAnswer,
} from "../../../src/server/summarize/output.ts";
import { OPEN_KINDS } from "../../../src/shared/summaryBody.ts";

const answer: SummaryAnswer = {
  headline: "CSV export for the orders page",
  short: "CSV export",
  goal: "Add a CSV export to the orders page",
  done: ["Added the export button", "Streamed rows instead of loading them all"],
  resolved: [{ text: "Export of 10k rows", evidence: "commit 2a4b6c8, tests pass" }],
  open: [
    { kind: "question", text: "Whether Excel needs a BOM" },
    { kind: "waiting", text: "Review of PR #12" },
  ],
  next: "Ask the user about the BOM",
  closed: [{ label: "O1", note: "merged in PR #9" }],
};

describe("SUMMARY_SCHEMA", () => {
  test("requires every field but next, and allows only the open-item kinds", () => {
    expect(SUMMARY_SCHEMA.required).toEqual([
      "headline",
      "short",
      "goal",
      "done",
      "resolved",
      "open",
      "closed",
    ]);
    expect(SUMMARY_SCHEMA.properties).toMatchObject({
      open: { items: { properties: { kind: { enum: [...OPEN_KINDS] } } } },
    });
  });
});

describe("readSummary", () => {
  test("reads a full answer, its closures under their labels", () => {
    expect(
      readSummary({ ...answer, closed: [{ label: "[O1]", evidence: "merged in PR #9" }] }),
    ).toEqual(answer);
  });

  test("puts each entry on one line and drops empty ones", () => {
    const read = readSummary({
      ...answer,
      goal: " Add a CSV\n export ",
      done: ["Added\n  the button", "  "],
      open: [{ kind: "todo", text: "" }],
      resolved: [{ text: "Export", evidence: "" }],
      next: "",
      closed: [],
    });
    expect(read).toMatchObject({
      goal: "Add a CSV export",
      done: ["Added the button"],
      open: [],
      resolved: [{ text: "Export", evidence: "" }],
      next: null,
    });
  });

  test("drops entries that only say there is nothing", () => {
    expect(
      readSummary({
        ...answer,
        open: [{ kind: "todo", text: "None" }],
        resolved: [{ text: "なし", evidence: "" }],
        next: "Nothing pending",
      }),
    ).toMatchObject({ open: [], resolved: [], next: null });
  });

  test("caps the short title and each entry, and the number of entries", () => {
    const read = readSummary({
      ...answer,
      short: "x".repeat(100),
      done: Array.from({ length: 30 }, () => "y".repeat(1000)),
    });
    expect(read?.short?.length).toBeLessThanOrEqual(41);
    expect(read?.done).toHaveLength(10);
    expect(read?.done[0]?.length).toBeLessThanOrEqual(301);
  });

  test("reads every label a closure names, however it is written", () => {
    const closed = (label: string) =>
      readSummary({ ...answer, closed: [{ label, evidence: "e" }] })?.closed.map((c) => c.label);
    expect(closed("O1 (PR #40 merged)")).toEqual(["O1"]);
    expect(closed("o2.")).toEqual(["O2"]);
    expect(closed("O1, O3")).toEqual(["O1", "O3"]);
    expect(closed("the first one")).toEqual([]);
  });

  test("keeps an item whose kind isn't one of the kinds, without a kind", () => {
    expect(readSummary({ ...answer, open: [{ kind: "later", text: "x" }] })?.open).toEqual([
      { kind: null, text: "x" },
    ]);
  });

  test("keeps the first open items up to the cap, which the prompt asks to put first", () => {
    const open = ["a", "", "b", "c", "d", "e"].map((text) => ({ kind: "todo", text }));
    expect(readSummary({ ...answer, open })?.open.map((i) => i.text)).toEqual(
      ["a", "b", "c", "d", "e"].slice(0, MAX_OPEN),
    );
  });

  test("is null without a headline, a goal or any work done", () => {
    expect(readSummary({ ...answer, headline: " " })).toBeNull();
    expect(readSummary({ ...answer, goal: "" })).toBeNull();
    expect(readSummary({ ...answer, done: [] })).toBeNull();
    expect(readSummary("Login form")).toBeNull();
    expect(readSummary(undefined)).toBeNull();
  });
});

describe("readTitle", () => {
  test("reads the headline and the short title, null when it is empty", () => {
    expect(readTitle({ headline: "Login form", short: "Login" })).toEqual({
      headline: "Login form",
      short: "Login",
    });
    expect(readTitle({ headline: "Login form", short: "" })?.short).toBeNull();
    expect(readTitle({ short: "Login" })).toBeNull();
  });
});

describe("renderBody", () => {
  test("writes the stored Markdown format in the summary's language", () => {
    expect(renderBody(answer, "en")).toBe(
      [
        "- Goal: Add a CSV export to the orders page",
        "- Done:",
        "  - Added the export button",
        "  - Streamed rows instead of loading them all",
        "- Resolved:",
        "  - Export of 10k rows: commit 2a4b6c8, tests pass",
        "- Open:",
        "  - [question] Whether Excel needs a BOM",
        "  - [waiting] Review of PR #12",
        "- Next: Ask the user about the BOM",
      ].join("\n"),
    );
    expect(renderBody({ ...answer, resolved: [], open: [], next: null }, "ja")).toBe(
      [
        "- 目的: Add a CSV export to the orders page",
        "- やったこと:",
        "  - Added the export button",
        "  - Streamed rows instead of loading them all",
      ].join("\n"),
    );
  });
});
