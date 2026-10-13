import { expect, test } from "bun:test";
import { clipEnds } from "../../../src/server/ingest/records.ts";

test("clipEnds leaves text within the limit as it is", () => {
  expect(clipEnds("abcdef", 6)).toBe("abcdef");
});

test("clipEnds keeps the start and most of the end, dropping the middle", () => {
  const text = `${"a".repeat(50)}${"m".repeat(100)}${"z".repeat(50)}`;
  const out = clipEnds(text, 100);
  expect(out.startsWith("a".repeat(25))).toBe(true);
  expect(out.endsWith("z".repeat(50))).toBe(true);
  expect(out).toContain("… (100 characters omitted) …");
  expect(out.replace(/\n… \(.*\) …\n/, "")).toHaveLength(100);
});
