import { describe, expect, test } from "bun:test";
import type { Artifact, CalendarSession, Usage } from "../../src/shared/api.ts";
import { addDays } from "../../src/web/src/lib/dates.ts";
import { sessionsUntil, summarize } from "../../src/web/src/lib/summary.ts";

const DAY0 = new Date(2026, 9, 5).getTime(); // 2026-10-05 (Mon) 00:00
const DAYS = Array.from({ length: 7 }, (_, i) => addDays(DAY0, i));
const at = (day: number, h: number, m = 0) => addDays(DAY0, day) + h * 3_600_000 + m * 60_000;
const H = 3_600_000;

const pr = (n: number, ts = 0): Artifact => ({
  kind: "pr",
  ref: `https://github.com/me/app/pull/${n}`,
  title: `PR ${n}`,
  ts,
});

const usage = (tokens: number, costUsd: number): Usage => ({
  tokens,
  input: tokens,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  costUsd,
  unpriced: false,
  model: null,
});

interface Seg {
  start: number;
  end: number;
  headline?: string;
  prs?: Artifact[];
  commits?: number;
  usage?: Usage;
  claudeMs?: number;
}

function session(id: string, projectId: number | null, ...segments: Seg[]): CalendarSession {
  return {
    id,
    projectId,
    label: null,
    title: id,
    startedAt: segments[0]?.start ?? 0,
    endedAt: segments.at(-1)?.end ?? 0,
    promptCount: 1,
    active: false,
    segments: segments.map((g) => ({
      start: g.start,
      end: g.end,
      headline: g.headline ?? id,
      summarized: true,
      body: null,
      prs: g.prs ?? [],
      commits: [],
      promptCount: 1,
      usage: g.usage ?? null,
      activity: {
        commits: g.commits ?? 0,
        prs: g.prs?.length ?? 0,
        filesEdited: 0,
        toolCalls: 0,
        subagents: 0,
        toolErrors: 0,
        interrupts: 0,
        apiErrors: 0,
        compactions: 0,
        claudeMs: g.claudeMs ?? null,
        effort: null,
      },
    })),
  };
}

describe("summarize", () => {
  test("adds up the period and counts parallel sessions' time once", () => {
    const s = summarize(DAYS, [
      session("a", 1, {
        start: at(0, 9),
        end: at(0, 11),
        commits: 2,
        usage: usage(1000, 1.5),
        claudeMs: H,
      }),
      session("b", 2, { start: at(0, 10), end: at(0, 12), usage: usage(500, 0.5) }),
    ]);
    expect(s.blocks).toBe(2);
    expect(s.busyMs).toBe(3 * H);
    expect(s.commits).toBe(2);
    expect(s.claudeMs).toBe(H);
    expect(s.usage?.tokens).toBe(1500);
    expect(s.usage?.costUsd).toBe(2);
    expect(s.days[0]?.busyMs).toBe(3 * H);
    expect(s.days[1]?.busyMs).toBe(0);
  });

  test("counts a PR once even when two sessions recorded it", () => {
    const s = summarize(DAYS, [
      session("a", 1, { start: at(0, 9), end: at(0, 10), prs: [pr(2, 2), pr(1, 1)] }),
      session("b", 1, { start: at(1, 9), end: at(1, 10), prs: [pr(1, 1)] }),
    ]);
    expect(s.prs.map((a) => a.ref.split("/").at(-1))).toEqual(["1", "2"]);
    expect(s.projects[0]?.prs).toHaveLength(2);
  });

  test("orders projects by time and lists each block once", () => {
    const s = summarize(DAYS, [
      session("short", 1, { start: at(0, 9), end: at(0, 10) }),
      // Crosses midnight: its time counts on both days, the block itself only on the first
      session("long", 2, { start: at(0, 22), end: at(1, 2) }, { start: at(1, 9), end: at(1, 10) }),
    ]);
    expect(s.projects.map((p) => p.projectId)).toEqual([2, 1]);
    const long = s.projects[0];
    expect(long?.busyMs).toBe(5 * H);
    expect(long?.blocks.map((b) => b.segment.start)).toEqual([at(0, 22), at(1, 9)]);
    expect(long?.clipped).toHaveLength(3);
    expect(s.blocks).toBe(3);
    expect(s.days[1]?.projects).toEqual([{ projectId: 2, busyMs: 3 * H }]);
  });

  test("leaves out blocks that don't match the filter", () => {
    const s = summarize(
      DAYS,
      [
        session(
          "a",
          1,
          { start: at(0, 9), end: at(0, 10), headline: "keep", commits: 1 },
          { start: at(0, 11), end: at(0, 12), headline: "drop", commits: 5 },
        ),
      ],
      (_, g) => g.headline === "keep",
    );
    expect(s.blocks).toBe(1);
    expect(s.commits).toBe(1);
    expect(s.busyMs).toBe(H);
  });

  test("is empty for a period without work", () => {
    const s = summarize(DAYS, []);
    expect(s).toMatchObject({ blocks: 0, busyMs: 0, claudeMs: null, usage: null, prs: [] });
    expect(s.projects).toEqual([]);
  });
});

describe("sessionsUntil", () => {
  test("drops later sections and shortens the one running past the cut", () => {
    const s = session(
      "a",
      1,
      { start: at(0, 9), end: at(0, 10) },
      { start: at(0, 11), end: at(0, 13), commits: 2 },
      { start: at(1, 9), end: at(1, 10) },
    );
    const [cut] = sessionsUntil([s], at(0, 12));
    expect(cut?.segments.map((g) => [g.start, g.end])).toEqual([
      [at(0, 9), at(0, 10)],
      [at(0, 11), at(0, 12)],
    ]);
    // Outcomes aren't timed within a section, so the shortened one keeps them
    expect(cut?.segments[1]?.activity.commits).toBe(2);
    expect(summarize(DAYS, [cut as CalendarSession]).busyMs).toBe(2 * H);
  });

  test("leaves out sessions that start after the cut", () => {
    expect(sessionsUntil([session("a", 1, { start: at(2, 9), end: at(2, 10) })], at(1, 0))).toEqual(
      [],
    );
  });
});
