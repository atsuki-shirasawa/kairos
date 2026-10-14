import { expect, test } from "bun:test";
import { COMMANDS, commandHelp, overview, unknownCommand, usageOf } from "../../src/cli/help.ts";

test("the overview lists every command with its summary", () => {
  const text = overview(false);
  for (const name of Object.keys(COMMANDS)) expect(text).toContain(`${name}  `);
  expect(text).toContain(COMMANDS.summarize?.summary ?? "");
});

test("the overview sorts commands into its sections", () => {
  const text = overview(false);
  const at = (s: string) => text.indexOf(s);
  expect(at("Browse:")).toBeLessThan(at("  report "));
  expect(at("  report ")).toBeLessThan(at("Server:"));
  expect(at("Troubleshoot:")).toBeLessThan(at("  doctor "));
});

test("option explanations wrap to the terminal, keeping a default on one line", () => {
  const page = commandHelp("report", false, 80) ?? "";
  for (const line of page.split("\n")) expect(line.length).toBeLessThanOrEqual(80);
  expect(page).toContain("(default: ~/.claude)");
  // The description reflows as a paragraph rather than leaving hand-broken stubs behind
  expect(page).toContain("Markdown, per day and project");
  // Too narrow for two columns: explanations move under their flag
  expect(commandHelp("report", false, 40)).toContain("  --claude-dir <path>\n      Claude Code");
});

test("the overview wraps to the terminal too", () => {
  for (const line of overview(false, 80).split("\n")) expect(line.length).toBeLessThanOrEqual(80);
  expect(overview(false, 80)).toContain("  doctor      check the setup");
});

test("without color the output has no escape codes, but still draws the logo", () => {
  const text = overview(false);
  expect(text).not.toContain("\x1b[");
  expect(text).toMatch(/█/);
  expect(overview(true)).toContain("\x1b[38;2;");
});

test("a command's page lists its options and examples; an unknown command has none", () => {
  const page = commandHelp("summarize", false);
  expect(page).toContain("Usage: kairos summarize [options]");
  for (const flag of ["--since", "--until", "--limit", "--dry-run"]) expect(page).toContain(flag);
  expect(page).toContain("kairos summarize --dry-run");
  expect(commandHelp("stop", false)).toBe("Usage: kairos stop\n\nStop the background server.");
  expect(commandHelp("nope", false)).toBeNull();
});

test("an unknown command is named above the overview", () => {
  expect(unknownCommand("nope", false)).toBe(`Unknown command: nope\n\n${overview(false)}`);
});

test("a command accepts the options its page lists, and arguments only when it shows them", () => {
  expect(usageOf("logs")).toEqual({ options: ["lines", "follow"], takesArgs: false });
  expect(usageOf("report")?.takesArgs).toBe(true);
  expect(usageOf("stop")).toEqual({ options: [], takesArgs: false });
  expect(usageOf("nope")).toBeNull();
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
