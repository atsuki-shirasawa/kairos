// Runs the real CLI to check that malformed command lines fail with a short message and exit 1,
// before any command does its work.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "../../src/cli/index.ts");
const env = { ...process.env, KAIROS_DATA_DIR: mkdtempSync(join(tmpdir(), "kairos-usage-")) };

function run(...args: string[]): { err: string; code: number } {
  const p = Bun.spawnSync(["bun", CLI, ...args], { env, stdout: "pipe", stderr: "pipe" });
  return { err: p.stderr.toString(), code: p.exitCode };
}

test("an unknown option gets one line and a pointer to the command's help, not a stack trace", () => {
  const r = run("status", "--foo");
  expect(r.code).toBe(1);
  expect(r.err).toBe("Unknown option '--foo'\nRun `kairos help status` to see its options.\n");
});

test("an option another command takes is refused instead of ignored", () => {
  const r = run("status", "--since", "2026-10-01");
  expect(r.code).toBe(1);
  expect(r.err).toContain("`kairos status` doesn't take --since");
  // Short forms are checked under their long name
  expect(run("status", "-f").err).toContain("doesn't take --follow");
});

test("an unknown command is reported before its options are checked", () => {
  const r = run("sumarize", "--since", "lastweek");
  expect(r.code).toBe(1);
  expect(r.err).toStartWith("Unknown command: sumarize\n");
  expect(r.err).not.toContain("lastweek");
});

test("arguments are refused by commands that take none", () => {
  const r = run("stop", "now");
  expect(r.code).toBe(1);
  expect(r.err).toContain("`kairos stop` takes no arguments");
});

test("days are checked before anything is read", () => {
  expect(run("report", "2026-02-30").err).toContain("Not a day: 2026-02-30");
  expect(run("report", "today", "--since", "yesterday").err).toContain("not both");
  expect(run("report", "--since", "2026-10-05", "--until", "2026-10-01").err).toContain(
    "is before --since",
  );
  expect(run("search").err).toContain("Give something to search for");
  expect(run("logs", "-n", "0").err).toContain("--lines must be a positive integer");
});

test("open checks its day before starting a server", () => {
  const r = run("open", "2026-02-30");
  expect(r.code).toBe(1);
  expect(r.err).toContain("Not a day: 2026-02-30");
});

test("report --until alone reports that one day", () => {
  const dir = mkdtempSync(join(tmpdir(), "kairos-report-"));
  mkdirSync(join(dir, "projects"));
  const p = Bun.spawnSync(
    ["bun", CLI, "report", "--until", "2026-10-01", "--claude-dir", dir, "--db", join(dir, "k.db")],
    { env: { ...env, KAIROS_DATA_DIR: dir }, stdout: "pipe", stderr: "pipe" },
  );
  expect(p.stderr.toString()).not.toContain("after today");
  expect(p.exitCode).toBe(0);
  expect(p.stdout.toString().trim()).toBe("No work in this period.");
});
