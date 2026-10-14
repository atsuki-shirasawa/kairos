import { describe, expect, test } from "bun:test";
import {
  encodeCursor,
  MESSAGES_DEFAULT_LIMIT,
  MESSAGES_MAX_LIMIT,
  pageLimit,
  parseCursor,
} from "../../../src/server/queries/messages.ts";

describe("parseCursor", () => {
  test.each<[string, string | null | undefined, { fileId: number; seq: number }]>([
    ["no cursor starts at the beginning", undefined, { fileId: -1, seq: -1 }],
    ["a null cursor starts at the beginning", null, { fileId: -1, seq: -1 }],
    ["a malformed cursor starts at the beginning", "3:x", { fileId: -1, seq: -1 }],
    ["a negative number is malformed", "-1:2", { fileId: -1, seq: -1 }],
    ["a well-formed cursor", "3:42", { fileId: 3, seq: 42 }],
  ])("%s", (_, cursor, expected) => {
    expect(parseCursor(cursor)).toEqual(expected);
  });

  test("reads back what encodeCursor wrote", () => {
    const position = { fileId: 7, seq: 1234 };
    expect(encodeCursor(position)).toBe("7:1234");
    expect(parseCursor(encodeCursor(position))).toEqual(position);
  });
});

test("pageLimit defaults and clamps the page size", () => {
  expect(pageLimit(undefined)).toBe(MESSAGES_DEFAULT_LIMIT);
  expect(pageLimit(0)).toBe(1);
  expect(pageLimit(50)).toBe(50);
  expect(pageLimit(MESSAGES_MAX_LIMIT + 1)).toBe(MESSAGES_MAX_LIMIT);
});
