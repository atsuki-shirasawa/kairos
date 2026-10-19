import { expect, test } from "bun:test";
import {
  buildContext,
  checkUsage,
  dayArg,
  dayOption,
  parseCommandLine,
  periodOptions,
  periodRange,
  positiveInt,
  summaryOptions,
} from "../../src/cli/args.ts";
import { CliError, UsageError } from "../../src/cli/errors.ts";
import { PORT } from "../../src/shared/constants.ts";

const NOW = new Date(2026, 9, 14, 12).getTime();
const midnight = (m: number, d: number) => new Date(2026, m - 1, d).getTime();
const where = { cliPath: "/k/src/cli/index.ts", repo: "/k" };

/** The message a call throws, or null when it doesn't. */
function thrown(f: () => unknown): string | null {
  try {
    f();
    return null;
  } catch (e) {
    expect(e).toBeInstanceOf(CliError);
    return (e as Error).message;
  }
}

test("a malformed command line is a usage error pointing at the command's help", () => {
  expect(thrown(() => parseCommandLine(["status", "--foo"]))).toBe(
    "Unknown option '--foo'\nRun `kairos help status` to see its options.",
  );
  expect(thrown(() => parseCommandLine(["--db"]))).toContain("Run `kairos help` to see the");
});

test("positive integers and days are checked, with the option named in the error", () => {
  expect(positiveInt("limit", "20")).toBe(20);
  expect(thrown(() => positiveInt("limit", "0"))).toBe(
    "--limit must be a positive integer (got: 0)",
  );
  expect(thrown(() => positiveInt("port", "4.5"))).toContain("--port must be");
  expect(dayOption("since", "yesterday", NOW)).toEqual({
    day: midnight(10, 13),
    text: "yesterday",
  });
  expect(thrown(() => dayOption("until", "soon", NOW))).toBe(
    "--until must be a date like 2026-08-01, today or yesterday (got: soon)",
  );
  expect(dayArg("2026-10-01", "open", NOW)).toBe(midnight(10, 1));
  expect(thrown(() => dayArg("2026-02-30", "open", NOW))).toBe(
    "Not a day: 2026-02-30 (use YYYY-MM-DD, today or yesterday)\nRun `kairos help open` to see its options.",
  );
});

test("a period ends at the midnight after --until, and must not end before it starts", () => {
  const period = periodOptions("2026-10-01", "2026-10-03", NOW);
  expect(periodRange(period)).toEqual({ from: midnight(10, 1), to: midnight(10, 4) });
  expect(periodRange(periodOptions(undefined, undefined, NOW))).toEqual({});
  // One day is a valid period
  expect(periodRange(periodOptions("today", "today", NOW))).toEqual({
    from: midnight(10, 14),
    to: midnight(10, 15),
  });
  expect(thrown(() => periodOptions("2026-10-05", "2026-10-01", NOW))).toBe(
    "--until (2026-10-01) is before --since (2026-10-05)",
  );
});

test("summary options are typed once they pass validation", () => {
  expect(summaryOptions({ "summary-lang": "ja", "summary-effort": "high" })).toEqual({
    lang: "ja",
    effort: "high",
    auto: true,
  });
  expect(summaryOptions({ "summary-model": "sonnet", "no-auto-summary": true })).toEqual({
    model: "sonnet",
    auto: false,
  });
  expect(thrown(() => summaryOptions({ "summary-lang": "fr" }))).toBe(
    "--summary-lang must be en or ja (got: fr)",
  );
  expect(thrown(() => summaryOptions({ "summary-effort": "huge" }))).toBe(
    "--summary-effort must be one of low, medium, high, xhigh, max (got: huge)",
  );
});

test("a command refuses options and arguments it doesn't take", () => {
  const usage = { options: ["port" as const], takesArgs: false };
  expect(() => checkUsage("status", usage, ["port", "help"], false)).not.toThrow();
  expect(thrown(() => checkUsage("status", usage, ["since"], false))).toBe(
    "`kairos status` doesn't take --since\nRun `kairos help status` to see its options.",
  );
  expect(thrown(() => checkUsage("status", usage, [], true))).toStartWith(
    "`kairos status` takes no arguments",
  );
  // An unknown command is left for the lookup to report
  expect(() => checkUsage("nope", null, ["x"], true)).not.toThrow();
});

test("the context carries validated values and what to hand on to the server", () => {
  const line = parseCommandLine([
    "restart",
    "--port",
    "4400",
    "--summary-lang",
    "en",
    "--no-auto-summary",
  ]);
  const ctx = buildContext("restart", line, where, NOW);
  expect(ctx.port).toBe(4400);
  expect(ctx.portArg).toBe("4400");
  expect(ctx.url).toBe("http://127.0.0.1:4400/");
  expect(ctx.summary).toEqual({ lang: "en", auto: false });
  expect(ctx.serveArgs).toEqual(["--port", "4400", "--summary-lang", "en", "--no-auto-summary"]);
  expect(ctx.serverOptionsGiven).toBe(true);
  expect(ctx.cliPath).toBe(where.cliPath);

  const plain = buildContext("restart", parseCommandLine(["restart", "--port", "4400"]), where);
  // --port only says where the server is, so it doesn't replace the kept options
  expect(plain.serverOptionsGiven).toBe(false);

  const search = buildContext("search", parseCommandLine(["search", "a", "b", "-n", "3"]), where);
  expect(search.args).toEqual(["a", "b"]);
  expect(search.lines).toBe(3);
  expect(search.port).toBe(PORT);
  expect(search.limit).toBeUndefined();
});

test("options are validated in a fixed order, summary options first", () => {
  const line = parseCommandLine(["summarize", "--summary-lang", "fr", "--limit", "0"]);
  expect(thrown(() => buildContext("summarize", line, where))).toContain("--summary-lang");
  expect(UsageError.prototype).toBeInstanceOf(CliError);
});

test("--headless narrows --old-format, and is refused without it", () => {
  const ctx = (argv: string[]) => buildContext("summarize", parseCommandLine(argv), where);
  expect(ctx(["summarize", "--old-format", "--headless"]).headless).toBe(true);
  expect(ctx(["summarize", "--old-format"]).headless).toBe(false);
  expect(thrown(() => ctx(["summarize", "--headless"]))).toContain("--old-format");
});
