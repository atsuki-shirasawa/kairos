// Runs the real CLI in a separate process to check background start, duplicate-start prevention and stop.
import { afterAll, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "../../src/cli/index.ts");
const root = mkdtempSync(join(tmpdir(), "kairos-daemon-"));
const claudeDir = join(root, "claude");
cpSync(join(import.meta.dir, "../fixtures/claude"), claudeDir, { recursive: true });
const PORT = "4398";
const env = { ...process.env, KAIROS_DATA_DIR: join(root, "data") };
const args = ["--port", PORT, "--claude-dir", claudeDir, "--no-auto-summary"];

function run(command: string): { out: string; ms: number; code: number } {
  const t = performance.now();
  const p = Bun.spawnSync(["bun", CLI, command, ...args], { env, stdout: "pipe", stderr: "pipe" });
  return {
    out: p.stdout.toString() + p.stderr.toString(),
    ms: performance.now() - t,
    code: p.exitCode,
  };
}

async function healthy(): Promise<boolean> {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (res.ok) return true;
    } catch {}
    await Bun.sleep(100);
  }
  return false;
}

afterAll(() => {
  run("stop");
});

test("ensure returns immediately without output, and concurrent calls start only one server", async () => {
  const procs = Array.from({ length: 5 }, () =>
    Bun.spawn(["bun", CLI, "ensure", ...args], { env, stdout: "pipe", stderr: "pipe" }),
  );
  const outputs = await Promise.all(
    procs.map(
      async (p) => (await new Response(p.stdout).text()) + (await new Response(p.stderr).text()),
    ),
  );
  await Promise.all(procs.map((p) => p.exited));
  expect(outputs.join("")).toBe("");
  expect(await healthy()).toBe(true);

  const pid = Number(readFileSync(join(root, "data", "kairos.pid"), "utf8").split(" ")[0]);
  const servers = Bun.spawnSync(["pgrep", "-f", `${CLI} serve .*--port ${PORT}`])
    .stdout.toString()
    .trim()
    .split("\n")
    .filter(Boolean);
  expect(servers).toEqual([String(pid)]);

  // If running, it only checks and returns immediately
  const again = run("ensure");
  expect(again.out).toBe("");
  expect(again.code).toBe(0);
  expect(run("status").out).toContain("Running");
}, 30_000);

test("stop stops the server and removes the PID file", async () => {
  expect(run("stop").out).toContain("Stopped.");
  expect(existsSync(join(root, "data", "kairos.pid"))).toBe(false);
  expect(run("status").out).toContain("Not running");
  expect(run("stop").out).toContain("Was not running");
}, 30_000);
