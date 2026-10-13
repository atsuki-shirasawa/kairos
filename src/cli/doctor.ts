// `kairos doctor`: checks the things the README's troubleshooting table asks you to check by hand.
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { LOG_PATH } from "../server/paths.ts";
import { health, isAlive, readPid } from "./daemon.ts";

/** How a check came out: fine, worth a look, or broken. */
export type CheckLevel = "ok" | "warn" | "fail";

/** One line of the doctor's report. */
export interface Check {
  name: string;
  level: CheckLevel;
  detail: string;
}

/** Where the doctor looks. */
export interface DoctorInput {
  repo: string;
  claudeDir: string;
  dbPath: string;
  port: number;
}

/** The repository's sources the server and the web UI are built from. */
const SERVER_SOURCES = ["src/server", "src/shared", "src/cli/daemon.ts"];
const WEB_SOURCES = ["src/web", "src/shared"];

/** Newest modification time among `paths`: files, or every file under a directory (0 when none). */
function newestMtime(repo: string, paths: string[]): number {
  let newest = 0;
  for (const path of paths) {
    const root = join(repo, path);
    if (!existsSync(root)) continue;
    if (statSync(root).isFile()) {
      newest = Math.max(newest, statSync(root).mtimeMs);
      continue;
    }
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true }))
      if (entry.isFile())
        newest = Math.max(newest, statSync(join(entry.parentPath, entry.name)).mtimeMs);
  }
  return newest;
}

/** Whether `claude` is on PATH and answers, since summaries run `claude -p`. */
function checkClaude(): Check {
  const path = Bun.which("claude");
  if (!path)
    return { name: "claude", level: "fail", detail: "not on PATH; summaries can't be written" };
  const p = Bun.spawnSync([path, "--version"], { stdout: "pipe", stderr: "pipe", timeout: 10_000 });
  return p.exitCode === 0
    ? { name: "claude", level: "ok", detail: p.stdout.toString().trim() }
    : { name: "claude", level: "fail", detail: `\`claude --version\` failed (${path})` };
}

/** Whether the web UI is built, and built from the current sources. */
function checkWebBuild(repo: string): Check {
  const index = join(repo, "dist/web/index.html");
  if (!existsSync(index))
    return { name: "web build", level: "fail", detail: "not built; run `kairos rebuild`" };
  return newestMtime(repo, WEB_SOURCES) > statSync(index).mtimeMs
    ? { name: "web build", level: "warn", detail: "older than src/web; run `kairos rebuild`" }
    : { name: "web build", level: "ok", detail: "up to date" };
}

/** Who listens on the port, from `lsof`; null when nobody does or lsof can't tell. */
function portHolder(port: number): string | null {
  const p = Bun.spawnSync(["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const lines = p.stdout.toString().split("\n");
  const pid = lines.find((l) => l.startsWith("p"))?.slice(1);
  const command = lines.find((l) => l.startsWith("c"))?.slice(1);
  return pid ? `${command ?? "?"} (pid ${pid})` : null;
}

/** Whether the server answers, and whether it was started after the last change to its code. */
async function checkServer(repo: string, port: number): Promise<Check> {
  const name = "server";
  const h = await health(port);
  const pid = readPid();
  if (h) {
    const stale = pid && newestMtime(repo, SERVER_SOURCES) > pid.at;
    return stale
      ? {
          name,
          level: "warn",
          detail: "started before its code last changed; run `kairos restart`",
        }
      : { name, level: "ok", detail: `running on port ${port} (v${h.version})` };
  }
  if (pid && isAlive(pid.pid))
    return { name, level: "warn", detail: `pid ${pid.pid} isn't answering; see ${LOG_PATH}` };
  const holder = portHolder(port);
  return holder
    ? { name, level: "fail", detail: `port ${port} is held by ${holder}` }
    : { name, level: "warn", detail: "not running; `kairos open` starts it" };
}

/** Every `command` string in a hooks setting, however deeply its matchers nest them. */
function commandsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(commandsIn);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([k, v]) =>
    k === "command" && typeof v === "string" ? [v] : commandsIn(v),
  );
}

/** Whether Claude Code's SessionStart hook runs `kairos ensure`, which keeps the server up. */
export function checkHook(claudeDir: string): Check {
  const name = "SessionStart hook";
  const path = join(claudeDir, "settings.json");
  try {
    const hooks = (JSON.parse(readFileSync(path, "utf8")) as { hooks?: { SessionStart?: unknown } })
      .hooks?.SessionStart;
    return commandsIn(hooks).some((c) => /(kairos|src\/cli\/index\.ts)['"]?\s+ensure\b/.test(c))
      ? { name, level: "ok", detail: "runs `kairos ensure`" }
      : { name, level: "warn", detail: `no \`kairos ensure\` in ${path} (see the README's Setup)` };
  } catch {
    return { name, level: "warn", detail: `can't read ${path}` };
  }
}

/** Whether the session logs are there to read. */
function checkLogs(claudeDir: string): Check {
  const dir = join(claudeDir, "projects");
  return existsSync(dir)
    ? { name: "session logs", level: "ok", detail: dir }
    : { name: "session logs", level: "fail", detail: `${dir} doesn't exist` };
}

/** Whether the DB passes SQLite's quick check. Opened read-only, so a running server isn't disturbed. */
function checkDb(dbPath: string): Check {
  const name = "database";
  if (!existsSync(dbPath))
    return { name, level: "warn", detail: `${dbPath} isn't created yet (the server makes it)` };
  try {
    const db = new Database(dbPath, { readonly: true });
    let result: string | undefined;
    try {
      result = db.query<{ quick_check: string }, []>("PRAGMA quick_check").get()?.quick_check;
    } finally {
      db.close();
    }
    const size = `${(statSync(dbPath).size / 1024 / 1024).toFixed(1)} MB`;
    return result === "ok"
      ? { name, level: "ok", detail: `${dbPath} (${size})` }
      : { name, level: "fail", detail: `quick_check: ${result}` };
  } catch (e) {
    return { name, level: "fail", detail: `can't open ${dbPath}: ${(e as Error).message}` };
  }
}

/** Runs every check, in the order a broken setup is best fixed. */
export async function runChecks(input: DoctorInput): Promise<Check[]> {
  return [
    checkLogs(input.claudeDir),
    checkClaude(),
    checkWebBuild(input.repo),
    await checkServer(input.repo, input.port),
    checkDb(input.dbPath),
    checkHook(input.claudeDir),
  ];
}

/** The checks as aligned lines, marked ✓ / ! / ✗. */
export function renderChecks(checks: Check[]): string {
  const mark: Record<CheckLevel, string> = { ok: "✓", warn: "!", fail: "✗" };
  const width = Math.max(...checks.map((c) => c.name.length));
  return checks.map((c) => `${mark[c.level]} ${c.name.padEnd(width)}  ${c.detail}`).join("\n");
}
