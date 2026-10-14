import { expect, test } from "bun:test";
import { openDb } from "../../../src/server/db/index.ts";
import { readKv, writeKv } from "../../../src/server/db/kv.ts";

test("readKv is undefined for a key never written", () => {
  expect(readKv(openDb(":memory:"), "missing")).toBeUndefined();
});

test("writeKv stores a value and replaces it on a second write", () => {
  const db = openDb(":memory:");
  writeKv(db, "k", "1");
  expect(readKv(db, "k")).toBe("1");
  writeKv(db, "k", "2");
  expect(readKv(db, "k")).toBe("2");
});
