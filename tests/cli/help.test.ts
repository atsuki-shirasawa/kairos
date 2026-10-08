import { expect, test } from "bun:test";
import { COMMANDS, commandHelp, overview } from "../../src/cli/help.ts";

test("the overview lists every command with its summary", () => {
  const text = overview(false);
  for (const name of Object.keys(COMMANDS)) expect(text).toContain(`${name}  `);
  expect(text).toContain(COMMANDS.summarize?.summary ?? "");
});

test("without color the output has no escape codes, but still draws the logo", () => {
  const text = overview(false);
  expect(text).not.toContain("\x1b[");
  expect(text).toMatch(/█/);
  expect(overview(true)).toContain("\x1b[38;2;");
});

test("a command's page lists its options and examples; an unknown command has none", () => {
  const page = commandHelp("summarize", false);
  expect(page).toContain("usage: kairos summarize [options]");
  for (const flag of ["--since", "--until", "--limit", "--dry-run"]) expect(page).toContain(flag);
  expect(page).toContain("kairos summarize --dry-run");
  expect(commandHelp("stop", false)).toBe("usage: kairos stop\n\nStop the background server.");
  expect(commandHelp("nope", false)).toBeNull();
});

test("help for an unknown command fails like the unknown command itself", () => {
  const cli = new URL("../../src/cli/index.ts", import.meta.url).pathname;
  const run = (...args: string[]) =>
    Bun.spawnSync(["bun", cli, ...args], { stdout: "pipe", stderr: "pipe" });
  const help = run("help", "sumarize");
  expect(help.exitCode).toBe(1);
  expect(help.stderr.toString()).toContain("Unknown command: sumarize");
  expect(run("sumarize").exitCode).toBe(1);
});
