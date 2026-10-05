// サーバーをバックグラウンドで起動・停止する。SessionStart hook から呼ぶ `kairos ensure` の中身。
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { LOG_PATH, PID_PATH } from "../server/paths.ts";
import type { HealthResponse } from "../shared/api.ts";
import { HOST, PORT } from "../shared/constants.ts";

/** 起動直後でまだ応答しないサーバーを、この時間は「起動中」とみなして二重に起動しない。 */
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
  /** 書き込んだ時刻。起動中かどうかの判断に使う。 */
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

/** PID ファイルが自分のものなら消す（別のサーバーが書き直していたら触らない）。 */
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
 * サーバーが動いていなければバックグラウンドで起動する。すぐに戻る（hook を待たせない）。
 * 起動したサーバーは Claude Code を終了しても動き続ける。
 */
export async function ensure(
  cliPath: string,
  args: string[] = [],
  port = PORT,
): Promise<EnsureResult> {
  if (await health(port)) return "running";
  const pid = readPid();
  if (pid && isAlive(pid.pid) && Date.now() - pid.at < STARTING_GRACE_MS) return "starting";

  // 同時に起動した複数のセッションから二重に起動しないよう、PID ファイルを排他的に作って順番を取る
  mkdirSync(dirname(PID_PATH), { recursive: true });
  if (pid) rmSync(PID_PATH, { force: true }); // 応答しない古いサーバーの残骸
  try {
    closeSync(openSync(PID_PATH, "wx"));
  } catch {
    return "starting"; // ほかのセッションが先に起動した
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
 * hook から受け継ぐ環境変数のうち、Claude Code のセッションに結びついたものは外す。
 * サーバーは要約のために `claude -p` を呼ぶので、親のセッションの続きと誤解させないため。
 */
function serverEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("CLAUDE")) env[k] = v;
  return env;
}

/** サーバーを止める。止めたら true。 */
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
