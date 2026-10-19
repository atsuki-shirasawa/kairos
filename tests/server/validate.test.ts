import { describe, expect, test } from "bun:test";
import {
  MAX_RANGE_MS,
  parseOpenItemUpdate,
  parseProjectUpdate,
  parseRange,
  parseRecapRequest,
  parseSearchQuery,
  parseSettingsUpdate,
} from "../../src/server/api/validate.ts";

const REQUIRED = { error: "from and to (ms, from < to) are required" };
const TOO_LONG = { error: "Range too long (max 62 days)" };

describe("parseRange", () => {
  test.each<[string, string | undefined, string | undefined, unknown]>([
    ["a valid range", "1000", "2000", { from: 1000, to: 2000 }],
    ["fractional ms", "1.5", "2.5", { from: 1.5, to: 2.5 }],
    ["a missing from", undefined, "2000", REQUIRED],
    ["a missing to", "1000", undefined, REQUIRED],
    ["non-numbers", "a", "b", REQUIRED],
    ["infinity", "0", "Infinity", REQUIRED],
    ["an empty range", "1000", "1000", REQUIRED],
    ["a reversed range", "2000", "1000", REQUIRED],
    ["exactly the longest range", "0", String(MAX_RANGE_MS), { from: 0, to: MAX_RANGE_MS }],
    ["a range one ms too long", "0", String(MAX_RANGE_MS + 1), TOO_LONG],
  ])("%s", (_name, from, to, expected) => {
    expect(parseRange(from, to)).toEqual(expected as ReturnType<typeof parseRange>);
  });
});

describe("parseSearchQuery", () => {
  test.each<[string, string | undefined, string | null]>([
    ["a missing query", undefined, null],
    ["a blank query", "   ", null],
    ["a one-character query", " a ", null],
    ["a two-character query, trimmed", "  ab ", "ab"],
    ["two astral characters, counted as characters", "😀😀", "😀😀"],
    ["a long query, cut", "x".repeat(250), "x".repeat(200)],
  ])("%s", (_name, param, expected) => {
    expect(parseSearchQuery(param)).toBe(expected);
  });
});

describe("parseSettingsUpdate", () => {
  test.each<[string, unknown, unknown]>([
    ["a language", { summaryLang: "ja" }, { summaryLang: "ja" }],
    ["headless visibility", { showTrials: false }, { showTrials: false }],
    ["both", { summaryLang: "en", showTrials: true }, { summaryLang: "en", showTrials: true }],
    ["unknown keys only", { theme: "dark" }, null],
    ["an empty body", {}, null],
    ["an unsupported language", { summaryLang: "fr" }, null],
    ["a non-boolean flag", { showTrials: "yes" }, null],
    ["one bad field among good ones", { summaryLang: "en", showTrials: 1 }, null],
    ["null", null, null],
    ["a string", "ja", null],
  ])("%s", (_name, body, expected) => {
    expect(parseSettingsUpdate(body)).toEqual(expected as ReturnType<typeof parseSettingsUpdate>);
  });
});

describe("parseProjectUpdate", () => {
  test.each<[string, unknown, unknown]>([
    ["a palette color", { color: "p3" }, { color: "p3" }],
    ["clearing the color", { color: null }, { color: null }],
    ["hiding", { hidden: true }, { hidden: true }],
    ["both", { color: "p0", hidden: false }, { color: "p0", hidden: false }],
    ["a color outside the palette", { color: "p8" }, null],
    ["a CSS color", { color: "#ff0000" }, null],
    ["a non-boolean hidden", { hidden: "true" }, null],
    ["an empty body", {}, null],
    ["null", null, null],
  ])("%s", (_name, body, expected) => {
    expect(parseProjectUpdate(body)).toEqual(expected as ReturnType<typeof parseProjectUpdate>);
  });
});

describe("parseOpenItemUpdate", () => {
  test.each<[string, unknown, unknown]>([
    ["done", { state: "done" }, { state: "done" }],
    ["dismissed", { state: "dismissed" }, { state: "dismissed" }],
    ["mistaken", { state: "mistaken" }, { state: "mistaken" }],
    ["a name inherited from Object", { state: "toString" }, null],
    ["reopened", { state: "open" }, { state: "open" }],
    ["extra fields are dropped", { state: "done", note: "x" }, { state: "done" }],
    ["an unknown state", { state: "closed" }, null],
    ["no state", {}, null],
    ["null", null, null],
  ])("%s", (_name, body, expected) => {
    expect(parseOpenItemUpdate(body)).toEqual(expected as ReturnType<typeof parseOpenItemUpdate>);
  });
});

describe("parseRecapRequest", () => {
  const valid = { projectId: 3, from: 1000, to: 2000 };

  test.each<[string, unknown, unknown]>([
    ["a valid request", valid, valid],
    ["extra fields are dropped", { ...valid, force: true }, valid],
    ["a fractional project id", { ...valid, projectId: 1.5 }, null],
    ["a string project id", { ...valid, projectId: "3" }, null],
    ["numeric strings for the range", { ...valid, from: "1000", to: "2000" }, null],
    ["fractional ms", { ...valid, from: 1000.5 }, null],
    ["a reversed range", { ...valid, from: 2000, to: 1000 }, null],
    ["a range too long", { ...valid, from: 0, to: MAX_RANGE_MS + 1 }, null],
    ["a missing range", { projectId: 3 }, null],
    ["null", null, null],
  ])("%s", (_name, body, expected) => {
    expect(parseRecapRequest(body)).toEqual(expected as ReturnType<typeof parseRecapRequest>);
  });
});
