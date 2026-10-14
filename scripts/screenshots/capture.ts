#!/usr/bin/env bun
// Captures the screenshots in docs/images/ from a fictional week (./demo.ts), so the docs show the
// real UI without any real logs. Runs its own server on a spare port with a throwaway data dir, so
// the everyday `kairos` and its DB are untouched.
// Run: bun run build && bun run screenshots
// To check the dark theme without touching the docs: bun run screenshots --scheme dark --out <dir>
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { openDb } from "../../src/server/db/index.ts";
import { Ingester } from "../../src/server/ingest/ingester.ts";
import { HeadlessChrome } from "./cdp.ts";
import {
  DEMO_DAY,
  DEMO_TZ,
  DEMO_WEEK,
  DRAWER_SESSION,
  type LiveDemoEntry,
  seedDemoSummaries,
  writeDemoLogs,
  writeLiveDemoLogs,
} from "./demo.ts";

const ROOT = join(import.meta.dir, "..", "..");
const { values: args } = parseArgs({
  options: { scheme: { type: "string", default: "light" }, out: { type: "string" } },
});
if (args.scheme !== "light" && args.scheme !== "dark") {
  console.error("--scheme must be light or dark");
  process.exit(1);
}
const OUT = args.out ? resolve(args.out) : join(ROOT, "docs", "images");
const PORT = 4329;
const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false };

/**
 * Writes the demo logs and builds a DB from them, with summaries. Returns the drawer's section
 * start and the registry entries of the sessions shown as running.
 */
function buildDemoData(
  claudeDir: string,
  dataDir: string,
): { drawerAt: number; live: LiveDemoEntry[] } {
  writeDemoLogs(claudeDir);
  const live = writeLiveDemoLogs(claudeDir, Date.now());
  // Empty until the live shot, so the server reads the registry but the other shots show none
  mkdirSync(join(claudeDir, "sessions"), { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  const db = openDb(join(dataDir, "kairos.db"));
  new Ingester(db, join(claudeDir, "projects")).scan();
  seedDemoSummaries(db);
  const first = db
    .query<{ start: number }, [string]>(
      "SELECT start FROM segments WHERE session_id = ? ORDER BY start LIMIT 1",
    )
    .get(DRAWER_SESSION);
  db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  if (!first) throw new Error("the drawer's session was not ingested");
  return { drawerAt: first.start, live };
}

/**
 * Starts a stand-in process per running session and registers it the way Claude Code does
 * (`<claudeDir>/sessions/<pid>.json`): the live page lists an entry only while its PID exists.
 * Pushes each process onto `procs` as it starts, so the caller can stop them however it exits.
 */
function startLiveSessions(
  claudeDir: string,
  live: LiveDemoEntry[],
  procs: ReturnType<typeof Bun.spawn>[],
): void {
  for (const entry of live) {
    const proc = Bun.spawn(["sleep", "600"], { stdout: "ignore" });
    procs.push(proc);
    const file = join(claudeDir, "sessions", `${proc.pid}.json`);
    writeFileSync(file, JSON.stringify({ pid: proc.pid, ...entry }));
  }
}

/** Waits until the server lists every running session, so the live shot isn't taken half empty. */
async function waitForLive(count: number): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/live`);
      const body = (await res.json()) as { sessions?: unknown[] };
      if (body.sessions?.length === count) return;
    } catch {
      // Not answering yet; try again
    }
    await Bun.sleep(200);
  }
  throw new Error(`the demo server did not list the ${count} running sessions`);
}

/** Starts `kairos serve` on the demo data and waits until it answers. */
async function startServer(
  claudeDir: string,
  dataDir: string,
): Promise<ReturnType<typeof Bun.spawn>> {
  if (await answers()) throw new Error(`port ${PORT} is already in use`);
  const proc = Bun.spawn(
    [
      "bun",
      join(ROOT, "src/cli/index.ts"),
      "serve",
      "--claude-dir",
      claudeDir,
      "--no-auto-summary",
      "--port",
      String(PORT),
    ],
    { env: { ...process.env, KAIROS_DATA_DIR: dataDir, TZ: DEMO_TZ }, stdout: "ignore" },
  );
  for (let i = 0; i < 50; i++) {
    if (await answers()) return proc;
    await Bun.sleep(200);
  }
  proc.kill();
  throw new Error("the demo server did not start");
}

async function answers(): Promise<boolean> {
  try {
    return (await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok;
  } catch {
    return false;
  }
}

/**
 * Opens each view and saves it as docs/images/screen-<name>.png. `beforeLive` runs just before the
 * live page's shot, so the sessions shown as running don't add the Live button's count to the
 * calendar shots.
 */
async function captureAll(drawerAt: number, beforeLive: () => Promise<void>): Promise<void> {
  const chrome = await HeadlessChrome.launch();
  try {
    await chrome.send("Emulation.setDeviceMetricsOverride", VIEWPORT);
    await chrome.send("Emulation.setTimezoneOverride", { timezoneId: DEMO_TZ });
    await chrome.send("Emulation.setLocaleOverride", { locale: "en-US" });
    await chrome.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: args.scheme }],
    });
    const base = `http://127.0.0.1:${PORT}/`;
    mkdirSync(OUT, { recursive: true });
    const shots: [string, string][] = [
      ["week", `?date=${DEMO_WEEK}&session=${DRAWER_SESSION}&at=${drawerAt}`],
      ["day", `?view=day&date=${DEMO_DAY}`],
      ["summary", `?layout=summary&date=${DEMO_WEEK}`],
      ["month", `?view=month&date=${DEMO_WEEK}`],
      ["live", "?layout=live"],
    ];
    for (const [name, query] of shots) {
      if (name === "live") await beforeLive();
      await chrome.open(base + query);
      const path = join(OUT, `screen-${name}.png`);
      writeFileSync(path, await chrome.screenshot());
      console.log(`wrote ${path}`);
    }
  } finally {
    chrome.close();
  }
}

if (!existsSync(join(ROOT, "dist", "web", "index.html"))) {
  console.error("The web UI isn't built. Run `bun run build` first.");
  process.exit(1);
}
const work = mkdtempSync(join(tmpdir(), "kairos-screenshots-"));
const claudeDir = join(work, "claude");
const dataDir = join(work, "data");
let server: ReturnType<typeof Bun.spawn> | null = null;
const sessions: ReturnType<typeof Bun.spawn>[] = [];
function cleanUp(): void {
  server?.kill();
  for (const p of sessions) p.kill();
  rmSync(work, { recursive: true, force: true });
}
// Ctrl-C skips `finally`; without this the stand-in sleeps would outlive the run
process.on("SIGINT", () => {
  cleanUp();
  process.exit(130);
});
try {
  const { drawerAt, live } = buildDemoData(claudeDir, dataDir);
  server = await startServer(claudeDir, dataDir);
  await captureAll(drawerAt, async () => {
    startLiveSessions(claudeDir, live, sessions);
    await waitForLive(live.length);
  });
} finally {
  cleanUp();
}
