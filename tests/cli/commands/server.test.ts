import { expect, test } from "bun:test";
import { restartArgs, withoutPort } from "../../../src/cli/commands/server.ts";

test("the port is dropped from kept options, wherever it sits", () => {
  expect(withoutPort(["--db", "/k.db", "--port", "4400", "--no-auto-summary"])).toEqual([
    "--db",
    "/k.db",
    "--no-auto-summary",
  ]);
  expect(withoutPort(["--db", "/k.db"])).toEqual(["--db", "/k.db"]);
});

test("restart keeps the running server's options unless server options are given", () => {
  const running = () => ["--summary-model", "sonnet", "--port", "4400"];
  expect(restartArgs({ serverOptionsGiven: false, serveArgs: [], runningArgs: running })).toEqual({
    args: ["--summary-model", "sonnet"],
    kept: ["--summary-model", "sonnet"],
  });
  // --port is where to find the server: handed on, but never kept
  expect(
    restartArgs({
      serverOptionsGiven: false,
      serveArgs: ["--port", "4401"],
      portArg: "4401",
      runningArgs: running,
    }),
  ).toEqual({
    args: ["--summary-model", "sonnet", "--port", "4401"],
    kept: ["--summary-model", "sonnet"],
  });
  expect(
    restartArgs({
      serverOptionsGiven: true,
      serveArgs: ["--summary-lang", "ja"],
      runningArgs: () => {
        throw new Error("the running server's options are not read when replaced");
      },
    }),
  ).toEqual({ args: ["--summary-lang", "ja"], kept: null });
});
