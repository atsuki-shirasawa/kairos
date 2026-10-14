import type { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LivenessCheck,
  parseEntry,
  type RegistryEntry,
  readRegistry,
} from "../../src/server/live/registry.ts";
import { liveSessions } from "../../src/server/live/sessions.ts";
import { LiveTracker } from "../../src/server/live/tracker.ts";
import { SID } from "../fixtures/ids.ts";
import { min, setup } from "./ingest/helpers.ts";
import { appendResponse, VISIBLE } from "./live/helpers.ts";

/** A registry entry for `sessionId`, as Claude Code writes it, with overrides. */
function entry(sessionId: string, over: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    pid: 4242,
    sessionId,
    cwd: "/Users/me/dev/app",
    kind: "interactive",
    status: "idle",
    statusUpdatedAt: min(1700),
    startedAt: min(1500),
    procStart: "Tue Sep 29 01:00:00 2026",
    name: "app-1",
    ...over,
  };
}

/** Appends an assistant record calling `name` with `input` to the facts session's log. */
function appendCall(projectsDir: string, n: number, name: string, input: unknown): void {
  const record = {
    parentUuid: null,
    isSidechain: false,
    type: "assistant",
    message: {
      id: `msg_live_${n}`,
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "tool_use", id: `toolu_live_${n}`, name, input }],
      stop_reason: "tool_use",
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    uuid: `21212121-live-${n}`,
    timestamp: new Date(min(1700 + n)).toISOString(),
    entrypoint: "cli",
    cwd: "/Users/me/dev/app",
    sessionId: SID.facts,
    version: "2.1.289",
  };
  appendFileSync(
    join(projectsDir, "-Users-me-dev-app", `${SID.facts}.jsonl`),
    `${JSON.stringify(record)}\n`,
  );
}

/** Appends Claude Code's record of the person pressing Esc to the facts session's log. */
function appendInterrupt(projectsDir: string, n: number): void {
  const record = {
    parentUuid: null,
    isSidechain: false,
    type: "user",
    message: { role: "user", content: [{ type: "text", text: "[Request interrupted by user]" }] },
    uuid: `21212121-live-${n}`,
    timestamp: new Date(min(1700 + n)).toISOString(),
    entrypoint: "cli",
    cwd: "/Users/me/dev/app",
    sessionId: SID.facts,
    version: "2.1.289",
  };
  appendFileSync(
    join(projectsDir, "-Users-me-dev-app", `${SID.facts}.jsonl`),
    `${JSON.stringify(record)}\n`,
  );
}

describe("registry", () => {
  test("parses Claude Code's entry and refuses ones missing what Kairos relies on", () => {
    const json = {
      pid: 7549,
      sessionId: "4bfd783d-f43e-491c-a9ec-0f3ec5e2e85b",
      cwd: "/Users/me/dev/app",
      startedAt: 1000,
      procStart: "Tue Oct 13 01:41:45 2026",
      kind: "interactive",
      name: "app-2f",
      status: "busy",
      updatedAt: 3000,
      statusUpdatedAt: 2000,
    };
    expect(parseEntry(json)).toEqual({
      pid: 7549,
      sessionId: json.sessionId,
      cwd: json.cwd,
      kind: "interactive",
      status: "busy",
      statusUpdatedAt: 2000,
      startedAt: 1000,
      procStart: json.procStart,
      name: "app-2f",
    });
    expect(parseEntry({ ...json, pid: "7549" })).toBeNull();
    expect(parseEntry({ ...json, sessionId: "../../etc" })).toBeNull();
    expect(parseEntry({ ...json, status: undefined })).toBeNull();
    expect(parseEntry(null)).toBeNull();
  });

  test("reads only <pid>.json files and skips broken ones", () => {
    const dir = mkdtempSync(join(tmpdir(), "kairos-registry-"));
    const good = { pid: 1, sessionId: SID.basic, cwd: "/x", status: "idle" };
    writeFileSync(join(dir, "1.json"), JSON.stringify(good));
    writeFileSync(join(dir, "2.json"), "{ half-written");
    writeFileSync(join(dir, "1.0123abcd.key"), JSON.stringify(good));
    writeFileSync(join(dir, "notes.json"), JSON.stringify(good));
    expect(readRegistry(dir)?.map((e) => e.pid)).toEqual([1]);
    expect(readRegistry(join(dir, "missing"))).toBeNull();
    rmSync(dir, { recursive: true });
  });

  test("a PID now held by a process started at another time is not the session's", () => {
    let starts = 0;
    const check = new LivenessCheck(
      (pid) => pid !== 9,
      (pid) => {
        starts++;
        return pid === 1 ? "Tue Sep 29 01:00:00 2026" : "Wed Sep 30 08:00:00 2026";
      },
    );
    expect(
      check.isRunning(entry(SID.basic, { pid: 1, procStart: "Tue Sep 29  01:00:00 2026" })),
    ).toBe(true);
    expect(
      check.isRunning(entry(SID.basic, { pid: 1, procStart: "Tue Sep 29 01:00:00 2026" })),
    ).toBe(true);
    expect(check.isRunning(entry(SID.basic, { pid: 2 }))).toBe(false);
    expect(check.isRunning(entry(SID.basic, { pid: 9 }))).toBe(false);
    // Once verified, a start time isn't asked again
    expect(
      check.isRunning(entry(SID.basic, { pid: 1, procStart: "Tue Sep 29 01:00:00 2026" })),
    ).toBe(true);
    expect(starts).toBe(3);
  });

  test("a failed ps is asked again, and entries gone from the registry are forgotten", () => {
    let answer: string | null = null;
    let starts = 0;
    const check = new LivenessCheck(
      () => true,
      () => {
        starts++;
        return answer;
      },
    );
    const e = entry(SID.basic, { pid: 3, procStart: "Tue Sep 29 01:00:00 2026" });
    expect(check.isRunning(e)).toBe(true);
    answer = "Wed Sep 30 08:00:00 2026";
    expect(check.isRunning(e)).toBe(false);
    expect(check.isRunning(e)).toBe(false);
    expect(starts).toBe(2);
    check.retain([]);
    answer = "Tue Sep 29 01:00:00 2026";
    expect(check.isRunning(e)).toBe(true);
    expect(starts).toBe(3);
  });

  test("the tracker announces a change only when what is running changes", () => {
    const dir = mkdtempSync(join(tmpdir(), "kairos-registry-"));
    const write = (status: string) =>
      writeFileSync(
        join(dir, "5.json"),
        JSON.stringify({ pid: 5, sessionId: SID.basic, cwd: "/x", status, statusUpdatedAt: 1 }),
      );
    let changes = 0;
    const tracker = new LiveTracker(
      dir,
      () => changes++,
      new LivenessCheck(
        () => true,
        () => null,
      ),
    );
    write("busy");
    tracker.refresh();
    tracker.refresh();
    expect(changes).toBe(1);
    expect(tracker.available).toBe(true);
    write("idle");
    tracker.refresh();
    expect(changes).toBe(2);
    expect(tracker.entries().map((e) => e.status)).toEqual(["idle"]);
    rmSync(dir, { recursive: true });
    tracker.refresh();
    expect(tracker.available).toBe(false);
    expect(tracker.entries()).toEqual([]);
  });
});

describe("liveSessions", () => {
  function ingested(): { db: Database; projectsDir: string; ingest: () => void } {
    const s = setup();
    s.ingester.scan();
    return { db: s.db, projectsDir: s.projectsDir, ingest: () => void s.ingester.scan() };
  }

  test("joins the registry with the ingested session", () => {
    const { db } = ingested();
    const [live] = liveSessions(db, [entry(SID.facts)], VISIBLE, min(1700));
    expect(live).toMatchObject({
      id: SID.facts,
      pid: 4242,
      name: "app-1",
      background: false,
      state: "waiting",
      since: min(1700),
      tool: null,
      question: null,
      branch: "main",
    });
    expect(live?.projectId).not.toBeNull();
    expect(live?.title).toBeTruthy();
    expect(live?.section).not.toBeNull();
    expect(live?.contextTokens).toBeGreaterThan(0);
    // Two tasks, the second completed with task_id / state
    expect(live?.tasks).toMatchObject({ total: 2, done: 1 });
    // The last run passed after an earlier failure
    expect(live?.test).toMatchObject({ command: "bun test", passed: true });
  });

  test("lists a session not ingested yet with what the registry knows", () => {
    const { db } = ingested();
    const id = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
    const [live] = liveSessions(db, [entry(id, { status: "busy", kind: "bg" })], VISIBLE, 0);
    expect(live).toMatchObject({
      id,
      background: true,
      state: "working",
      projectId: null,
      title: null,
      section: null,
      tasks: null,
      test: null,
    });
  });

  test("shows the call in flight while working, and a pending question as asking", () => {
    const { db, projectsDir, ingest } = ingested();
    appendCall(projectsDir, 1, "Bash", { command: "bun run build", description: "Build" });
    ingest();
    const busy = entry(SID.facts, { status: "busy" });
    expect(liveSessions(db, [busy], VISIBLE, min(1702))[0]).toMatchObject({
      state: "working",
      tool: { name: "Bash", since: min(1701) },
      question: null,
    });
    // An idle session isn't running anything, whatever the log left behind
    expect(liveSessions(db, [entry(SID.facts)], VISIBLE, min(1702))[0]?.tool).toBeNull();

    appendCall(projectsDir, 2, "AskUserQuestion", {
      questions: [{ question: "Ship it now?", header: "ship", options: [] }],
    });
    ingest();
    expect(liveSessions(db, [busy], VISIBLE, min(1703))[0]).toMatchObject({
      state: "asking",
      question: "Ship it now?",
      tool: null,
    });
  });

  test("a question dismissed with Esc no longer counts as asking", () => {
    const { db, projectsDir, ingest } = ingested();
    appendCall(projectsDir, 1, "AskUserQuestion", {
      questions: [{ question: "Ship it now?", header: "ship", options: [] }],
    });
    appendInterrupt(projectsDir, 2);
    ingest();
    expect(liveSessions(db, [entry(SID.facts)], VISIBLE, min(1703))[0]).toMatchObject({
      state: "waiting",
      question: null,
    });
  });

  test("follows the calendar's visibility", () => {
    const { db } = ingested();
    const headless = entry(SID.headless);
    const sdk = entry("0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e", { kind: "sdk" });
    const hidden = entry(SID.basic, { cwd: "/hidden" });
    const all = [headless, sdk, hidden];
    expect(liveSessions(db, all, { ...VISIBLE, hiddenCwds: ["/hidden"] }, 0)).toEqual([]);
    expect(
      liveSessions(db, all, { headless: true, hiddenCwds: ["/hidden"] }, 0).map((s) => s.id),
    ).toEqual([headless.sessionId, sdk.sessionId]);
  });

  test("leaves out sessions of hidden projects", () => {
    const { db } = ingested();
    const [shown] = liveSessions(db, [entry(SID.facts)], VISIBLE, 0);
    db.run("UPDATE projects SET hidden = 1 WHERE id = ?", [shown?.projectId ?? -1]);
    expect(liveSessions(db, [entry(SID.facts)], VISIBLE, 0)).toEqual([]);
  });

  test("reads the window and the cache's TTL from the latest responses, and counts tokens", () => {
    const { db, projectsDir, ingest } = ingested();
    // A 1-hour cache write, then a request that only reads it
    appendResponse(projectsDir, 1, {
      input_tokens: 1000,
      cache_creation_input_tokens: 4000,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 4000 },
    });
    appendResponse(projectsDir, 2, { input_tokens: 1000, cache_read_input_tokens: 304_000 });
    ingest();
    const [live] = liveSessions(db, [entry(SID.facts)], VISIBLE, min(1705));
    expect(live?.contextTokens).toBe(305_000);
    expect(live?.usage).toMatchObject({
      model: "claude-opus-5-5",
      fast: false,
      contextWindow: 1_000_000,
      cacheExpiresAt: min(1702) + 60 * 60_000,
      cacheTtlMs: 60 * 60_000,
    });
    // Both responses fall in the last 15 minutes: 5,100 + 305,100 tokens, four times over for an
    // hour (other fixture sessions don't count, only this one's)
    expect(live?.usage?.perHourTokens).toBe(310_200 * 4);
  });

  test("an unpriced model still has a window, a cache and tokens", () => {
    const { db, projectsDir, ingest } = ingested();
    appendResponse(projectsDir, 1, { input_tokens: 500, cache_creation_input_tokens: 800 }, "x-1");
    ingest();
    const usage = liveSessions(db, [entry(SID.facts)], VISIBLE, min(1702))[0]?.usage;
    // No breakdown means the default 5-minute write
    expect(usage).toMatchObject({ model: "x-1", cacheExpiresAt: min(1701) + 5 * 60_000 });
    expect(usage?.perHourTokens).toBe(1_400 * 4);
  });
});
