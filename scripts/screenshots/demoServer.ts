// The fictional data and a `kairos serve` on it, for the captures (the docs screenshots and the
// visual baseline) and the end-to-end tests (tests/e2e). Runs on a spare port with a throwaway
// data dir and a stopped clock, so the everyday `kairos` and its DB are untouched, and the
// stand-ins the live page needs.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../src/server/db/index.ts";
import { Ingester } from "../../src/server/ingest/ingester.ts";
import { PLAN_LIMITS_FILE } from "../../src/server/paths.ts";
import { savePlanLimits } from "../../src/server/planLimits.ts";
import type { LiveResponse, SessionDetail } from "../../src/shared/api.ts";
import { DAY, HOUR } from "../../src/shared/dates.ts";
import { FROZEN_NOW_ENV, freezeDate } from "./clock.ts";
import {
  DEMO_NOW,
  DEMO_TZ,
  type LiveDemoEntry,
  seedDemoSummaries,
  writeDemoLogs,
  writeLiveDemoLogs,
} from "./demo.ts";
import { seedStressSummaries, stubClaude, writeStressLogs } from "./stress.ts";
import { waitFor } from "./wait.ts";

/** Repository root. */
export const ROOT = join(import.meta.dir, "..", "..");
const PORT = 4329;
/** Where the capture's server answers. */
export const BASE_URL = `http://127.0.0.1:${PORT}/`;

/** What the session registry holds, as the live page's states need it. */
export type RegistryState = "empty" | "running" | "on-you" | "unreadable";

/** Fails early when the web UI hasn't been built, since the server serves `dist/web`. */
export function requireBuild(): void {
  if (!existsSync(join(ROOT, "dist", "web", "index.html"))) {
    throw new Error("The web UI isn't built. Run `bun run build` first.");
  }
}

/** The fictional data, its server, and the stand-in processes of the sessions shown as running. */
export class DemoServer {
  private server: ReturnType<typeof Bun.spawn> | null = null;
  private readonly standIns = new Map<string, ReturnType<typeof Bun.spawn>>();

  private constructor(
    private readonly work: string,
    private readonly live: LiveDemoEntry[],
  ) {}

  /** Writes the logs, builds the DB with its summaries, and starts the server on it. */
  static async start(): Promise<DemoServer> {
    // The capture's own ingest and seeding run on the same clock as the server
    freezeDate(DEMO_NOW);
    const work = mkdtempSync(join(tmpdir(), "kairos-screenshots-"));
    const demo = new DemoServer(work, writeAllLogs(join(work, "claude")));
    try {
      buildDb(join(work, "claude"), join(work, "data"));
      writeStub(join(work, "bin"));
      demo.server = await startServer(work);
    } catch (e) {
      await demo.close();
      throw e;
    }
    return demo;
  }

  private get registryDir(): string {
    return join(this.work, "claude", "sessions");
  }

  /**
   * Sets the registry to `state` and waits until the live page's data says so. `running` starts a
   * stand-in process per running demo session (the page lists an entry only while its PID exists);
   * `on-you` keeps only those waiting on you. Resolves to the number of sessions registered.
   */
  async setRegistry(state: RegistryState): Promise<number> {
    this.clearRegistry();
    if (state === "unreadable") {
      // A directory it may not list, as for a Claude Code that keeps the registry elsewhere
      mkdirSync(this.registryDir, { recursive: true });
      chmodSync(this.registryDir, 0o000);
      await waitForLive((live) => !live.available);
      return 0;
    }
    mkdirSync(this.registryDir, { recursive: true });
    const entries =
      state === "empty" ? [] : this.live.filter((e) => state === "running" || e.onYou);
    for (const entry of entries) this.register(entry);
    await waitForLive((live) => live.available && live.sessions.length === entries.length);
    return entries.length;
  }

  /**
   * Stops the server, runs `whileDown` with the logs' directory (to write what it should find
   * when it comes back), and starts it again on the same data and port.
   */
  async restart(whileDown: (claudeDir: string) => void): Promise<void> {
    const server = this.server;
    this.server = null;
    server?.kill();
    await server?.exited;
    whileDown(join(this.work, "claude"));
    try {
      this.server = await startServer(this.work);
    } catch (e) {
      throw new Error(`restarting the demo server: ${(e as Error).message}`);
    }
  }

  /** Removes the registry directory, readable or not. */
  private clearRegistry(): void {
    if (existsSync(this.registryDir)) chmodSync(this.registryDir, 0o700);
    rmSync(this.registryDir, { recursive: true, force: true });
  }

  /** Registers a running session the way Claude Code does (`<claudeDir>/sessions/<pid>.json`). */
  private register(entry: LiveDemoEntry): void {
    let proc = this.standIns.get(entry.sessionId);
    if (!proc) {
      proc = Bun.spawn(["sleep", "3600"], { stdout: "ignore" });
      this.standIns.set(entry.sessionId, proc);
    }
    const file = join(this.registryDir, `${proc.pid}.json`);
    const { onYou: _, ...registered } = entry;
    writeFileSync(file, JSON.stringify({ pid: proc.pid, ...registered }));
  }

  /** Section starts of a session, oldest first. */
  async sectionStarts(sessionId: string): Promise<number[]> {
    return (await sessionDetail(sessionId)).sections.map((s) => s.start);
  }

  /**
   * Asks for a section's summary, which the stand-in `claude` fails or never finishes, and waits
   * until the drawer's data shows it `failed` or `pending`.
   */
  async requestSummary(
    sessionId: string,
    start: number,
    expect: "failed" | "pending",
  ): Promise<void> {
    const res = await api(`sessions/${sessionId}/sections/${start}/summary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!res.ok) throw new Error(`summary request: ${res.status} ${await res.text()}`);
    await waitFor(`the summary to be ${expect}`, async () => {
      const section = (await sessionDetail(sessionId)).sections.find((s) => s.start === start);
      return expect === "failed" ? Boolean(section?.error) : Boolean(section?.pending);
    });
  }

  /**
   * Stops the server and the stand-ins, and removes the data once they have exited (the server
   * writes to it until then). Safe to call more than once.
   */
  async close(): Promise<void> {
    const procs = [this.server, ...this.standIns.values()].filter((p) => p !== null);
    this.server = null;
    this.standIns.clear();
    for (const proc of procs) proc.kill();
    await Promise.all(procs.map((p) => p.exited));
    this.clearRegistry();
    rmSync(this.work, { recursive: true, force: true });
  }
}

/** Writes every log the captures show, and returns the registry entries of the running sessions. */
function writeAllLogs(claudeDir: string): LiveDemoEntry[] {
  writeDemoLogs(claudeDir);
  writeStressLogs(claudeDir);
  // Empty until a shot asks for running sessions, so the server reads the registry from the start
  mkdirSync(join(claudeDir, "sessions"), { recursive: true });
  return writeLiveDemoLogs(claudeDir, DEMO_NOW);
}

/** Ingests the logs into a fresh DB and stores the summaries the summarizer would have written. */
function buildDb(claudeDir: string, dataDir: string): void {
  mkdirSync(dataDir, { recursive: true });
  const db = openDb(join(dataDir, "kairos.db"));
  new Ingester(db, join(claudeDir, "projects")).scan();
  seedDemoSummaries(db);
  seedStressSummaries(db);
  db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  writeDemoLimits(dataDir);
}

/** The plan's usage limits as the status line wrapper would have just recorded them. */
function writeDemoLimits(dataDir: string): void {
  savePlanLimits(join(dataDir, PLAN_LIMITS_FILE), {
    fiveHour: { usedPercent: 38, resetsAt: DEMO_NOW + 2 * HOUR },
    sevenDay: { usedPercent: 61, resetsAt: DEMO_NOW + 3 * DAY },
    seenAt: DEMO_NOW,
  });
}

/** Puts the stand-in `claude` in `binDir`, which the server's PATH starts with. */
function writeStub(binDir: string): void {
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(binDir, "claude"), stubClaude(), { mode: 0o755 });
}

/** Starts `kairos serve` on the demo data, on the stopped clock, and waits until it answers. */
async function startServer(work: string): Promise<ReturnType<typeof Bun.spawn>> {
  if (await answers()) throw new Error(`port ${PORT} is already in use`);
  const proc = Bun.spawn(
    [
      "bun",
      "--preload",
      join(import.meta.dir, "clock.preload.ts"),
      join(ROOT, "src/cli/index.ts"),
      "serve",
      "--claude-dir",
      join(work, "claude"),
      "--no-auto-summary",
      "--port",
      String(PORT),
    ],
    {
      env: {
        ...process.env,
        KAIROS_DATA_DIR: join(work, "data"),
        TZ: DEMO_TZ,
        PATH: `${join(work, "bin")}:${process.env.PATH ?? ""}`,
        [FROZEN_NOW_ENV]: String(DEMO_NOW),
      },
      // Its stderr would only carry the summary failures the capture causes on purpose
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  try {
    await waitFor("the demo server to start", answers);
  } catch (e) {
    proc.kill();
    throw e;
  }
  return proc;
}

/** How long one request to the demo server may take; it answers at once unless something is wrong. */
const REQUEST_TIMEOUT_MS = 5_000;

/** A request to the demo server's API, given up after `REQUEST_TIMEOUT_MS`. */
function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE_URL}api/${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function answers(): Promise<boolean> {
  try {
    return (await api("health")).ok;
  } catch {
    return false;
  }
}

async function sessionDetail(id: string): Promise<SessionDetail> {
  const res = await api(`sessions/${id}`);
  if (!res.ok) throw new Error(`session ${id}: ${res.status}`);
  return (await res.json()) as SessionDetail;
}

/** Waits until the server's live data passes `ok`; the registry is re-read every few seconds. */
async function waitForLive(ok: (live: LiveResponse) => boolean): Promise<void> {
  await waitFor("the live page's data", async () => {
    const res = await api("live");
    return ok((await res.json()) as LiveResponse);
  });
}
