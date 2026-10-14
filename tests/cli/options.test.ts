import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  flagLabel,
  KEPT_SERVER_OPTIONS,
  OPTIONS,
  SERVER_OPTIONS,
  serveArgs,
} from "../../src/cli/options.ts";

test("help labels show the short form and the value's placeholder", () => {
  expect(flagLabel("lines")).toBe("-n, --lines <n>");
  expect(flagLabel("follow")).toBe("-f, --follow");
  expect(flagLabel("db")).toBe("--db <path>");
  expect(flagLabel("json")).toBe("--json");
});

test("server options are handed on in a fixed order, leaving out defaults", () => {
  expect(
    serveArgs({ "claude-dir": OPTIONS["claude-dir"].default, db: OPTIONS.db.default }),
  ).toEqual([]);
  expect(
    serveArgs({
      "no-auto-summary": true,
      "summary-effort": "high",
      "summary-lang": "ja",
      "summary-model": "sonnet",
      port: "4400",
      db: "k.db",
      "claude-dir": "claude",
      json: true,
    }),
  ).toEqual([
    "--claude-dir",
    resolve("claude"),
    "--db",
    resolve("k.db"),
    "--port",
    "4400",
    "--summary-model",
    "sonnet",
    "--summary-lang",
    "ja",
    "--summary-effort",
    "high",
    "--no-auto-summary",
  ]);
  expect(serveArgs({ "summary-model": "", "no-auto-summary": false })).toEqual([]);
});

test("restart keeps every server option except the port", () => {
  expect([...KEPT_SERVER_OPTIONS]).toEqual(SERVER_OPTIONS.filter((name) => name !== "port"));
  expect(KEPT_SERVER_OPTIONS.has("port")).toBe(false);
});
