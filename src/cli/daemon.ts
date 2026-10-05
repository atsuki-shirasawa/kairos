// Starts and stops the server in the background. This is what `kairos ensure` (run from the SessionStart hook) does.
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { LOG_PATH, PID_PATH } from "../server/paths.ts";
import type { HealthResponse } from "../shared/api.ts";
import { HOST, PORT } from "../shared/constants.ts";

/** For this long, a server that just started and does not answer yet counts as "starting", so it is not started twice. */
const STARTING_GRACE_MS = 30_000;

export async function health(port = PORT, timeoutMs = 300): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`http://${HOST}:${port}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await res.json()) as HealthResponse;
    return body.name === "kairos" ? body : null;
  } catch {
    return null;
  }
}

interface PidFile {
  pid: number;
  /** When it was written. Used to tell whether the server is still starting. */
  at: number;
}

export function readPid(): PidFile | null {
  try {
    const [pid, at] = readFileSync(PID_PATH, "utf8").trim().split(/\s+/).map(Number);
    return pid ? { pid, at: at || 0 } : null;
  } catch {
    return null;
  }
}

export function writePid(pid: number): void {
  mkdirSync(dirname(PID_PATH), { recursive: true });
  writeFileSync(PID_PATH, `${pid} ${Date.now()}\n`);
}

/** Removes the PID file if it is ours (leaves it alone if another server rewrote it). */
export function removePid(pid: number): void {
  if (readPid()?.pid === pid) rmSync(PID_PATH, { force: true });
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export type EnsureResult = "running" | "starting" | "started";

/**
 * Starts the server in the background if it is not running. Returns immediately (does not hold up the hook).
 * The started server keeps running after Claude Code exits.
 */
export async function ensure(
  cliPath: string,
  args: string[] = [],
  port = PORT,
): Promise<EnsureResult> {
  if (await health(port)) return "running";
  const pid = readPid();
  if (pid && isAlive(pid.pid) && Date.now() - pid.at < STARTING_GRACE_MS) return "starting";

  // Create the PID file exclusively to take turns, so sessions starting at once do not start two servers
  mkdirSync(dirname(PID_PATH), { recursive: true });
  if (pid) rmSync(PID_PATH, { force: true }); // Left over from an old server that does not respond
  try {
    closeSync(openSync(PID_PATH, "wx"));
  } catch {
    return "starting"; // Another session started it first
  }

  mkdirSync(dirname(LOG_PATH), { recursive: true });
  const log = openSync(LOG_PATH, "a");
  const child = spawn(process.execPath, [cliPath, "serve", ...args], {
    detached: true,
    stdio: ["ignore", log, log],
    env: serverEnv(),
  });
  closeSync(log);
  if (child.pid) writePid(child.pid);
  child.unref();
  return "started";
}

/**
 * Drops the environment variables inherited from the hook that are tied to a Claude Code session.
 * The server calls `claude -p` for summaries, which must not be mistaken for part of the parent session.
 */
function serverEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("CLAUDE")) env[k] = v;
  return env;
}

/** Stops the server. Returns true if it was stopped. */
export async function stop(timeoutMs = 5000): Promise<boolean> {
  const pid = readPid();
  if (!pid || !isAlive(pid.pid)) {
    rmSync(PID_PATH, { force: true });
    return false;
  }
  process.kill(pid.pid, "SIGTERM");
  const deadline = Date.now() + timeoutMs;
  while (isAlive(pid.pid) && Date.now() < deadline) await Bun.sleep(50);
  if (isAlive(pid.pid)) process.kill(pid.pid, "SIGKILL");
  rmSync(PID_PATH, { force: true });
  return true;
}
