import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PLAN_LIMITS_FILE } from "../../../src/server/paths.ts";
import { readPlanLimits } from "../../../src/server/planLimits.ts";

const CLI = join(import.meta.dir, "../../../src/cli/index.ts");

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "kairos-statusline-"));
});
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

/** Runs `kairos statusline` on `input` in the test's data directory. */
async function statusline(input: string, command: string[]) {
  const proc = Bun.spawn(["bun", CLI, "statusline", ...command], {
    stdin: new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, KAIROS_DATA_DIR: dataDir },
  });
  return { out: await new Response(proc.stdout).text(), code: await proc.exited };
}

const INPUT = JSON.stringify({
  rate_limits: { five_hour: { used_percentage: 12, resets_at: 1_792_010_000 } },
});

test("records the limits and runs the wrapped command on the same input", async () => {
  const { out, code } = await statusline(INPUT, ["--", "wc -c; exit 3"]);
  expect(out.trim()).toBe(String(INPUT.length));
  // The wrapped command's exit code is Claude Code's to see
  expect(code).toBe(3);
  expect(readPlanLimits(join(dataDir, PLAN_LIMITS_FILE))?.fiveHour?.usedPercent).toBe(12);
});

test("runs the wrapped command in a shell, as Claude Code would", async () => {
  const { out } = await statusline(INPUT, ["--", "wc -c | tr -d ' '"]);
  expect(out.trim()).toBe(String(INPUT.length));
});

test("still prints the line when the input can't be read", async () => {
  const { out, code } = await statusline("not json", ["--", "echo", "line"]);
  expect([out.trim(), code]).toEqual(["line", 0]);
  expect(existsSync(join(dataDir, PLAN_LIMITS_FILE))).toBe(false);
});

test("prints nothing without a command", async () => {
  expect(await statusline(INPUT, [])).toEqual({ out: "", code: 0 });
});
