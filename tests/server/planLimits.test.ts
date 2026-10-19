import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isWorthSaving,
  laterWindow,
  limitsFromStatusLine,
  mergePlanLimits,
  parsePlanLimits,
  readPlanLimits,
  recordPlanLimits,
  savePlanLimits,
  watchPlanLimits,
} from "../../src/server/planLimits.ts";
import type { PlanLimits } from "../../src/shared/api.ts";
import { MINUTE, SECOND } from "../../src/shared/dates.ts";

const NOW = 1_792_000_000_000;
const FIVE_RESET_S = 1_792_010_000;
const WEEK_RESET_S = 1_792_400_000;

/** A status line input as Claude Code writes it, with `rate_limits` as given. */
function statusLine(rateLimits: unknown): string {
  return JSON.stringify({
    session_id: "s",
    model: { id: "claude-opus-5-5" },
    rate_limits: rateLimits,
  });
}

const BOTH = {
  five_hour: { used_percentage: 23.5, resets_at: FIVE_RESET_S },
  seven_day: { used_percentage: 41.2, resets_at: WEEK_RESET_S },
};

const LIMITS: PlanLimits = {
  fiveHour: { usedPercent: 23.5, resetsAt: FIVE_RESET_S * SECOND },
  sevenDay: { usedPercent: 41.2, resetsAt: WEEK_RESET_S * SECOND },
  seenAt: NOW,
};

describe("limitsFromStatusLine", () => {
  test("takes both windows, with reset times in ms", () => {
    expect(limitsFromStatusLine(JSON.parse(statusLine(BOTH)), NOW)).toEqual(LIMITS);
  });

  test("keeps a window alone when Claude Code dropped the other after its reset", () => {
    const input = JSON.parse(statusLine({ seven_day: BOTH.seven_day }));
    expect(limitsFromStatusLine(input, NOW)).toEqual({ ...LIMITS, fiveHour: null });
  });

  test("is null without limits: an API key, or before a session's first response", () => {
    expect(limitsFromStatusLine({ session_id: "s" }, NOW)).toBeNull();
    expect(limitsFromStatusLine(JSON.parse(statusLine({})), NOW)).toBeNull();
    expect(limitsFromStatusLine(null, NOW)).toBeNull();
  });

  test("drops a malformed window rather than guessing", () => {
    const input = JSON.parse(
      statusLine({ five_hour: { used_percentage: "23" }, seven_day: BOTH.seven_day }),
    );
    expect(limitsFromStatusLine(input, NOW)?.fiveHour).toBeNull();
  });
});

describe("parsePlanLimits", () => {
  test("reads back what is saved", () => {
    expect(parsePlanLimits(JSON.parse(JSON.stringify(LIMITS)))).toEqual(LIMITS);
  });

  test("is null for anything else", () => {
    expect(parsePlanLimits({ fiveHour: LIMITS.fiveHour })).toBeNull();
    expect(parsePlanLimits([])).toBeNull();
  });
});

describe("laterWindow", () => {
  const window = (usedPercent: number, resetsAt: number) => ({ usedPercent, resetsAt });

  test("takes the window that resets later: it is the newer one", () => {
    expect(laterWindow(window(90, 1000), window(5, 2000))).toEqual(window(5, 2000));
    // An idle session still reporting the window before
    expect(laterWindow(window(5, 2000), window(90, 1000))).toEqual(window(5, 2000));
  });

  test("within one window, takes the larger use: an idle session's reading is older", () => {
    expect(laterWindow(window(38, 1000), window(20, 1000))).toEqual(window(38, 1000));
    expect(laterWindow(window(20, 1000), window(38, 1000))).toEqual(window(38, 1000));
  });

  test("keeps the saved window when the reading leaves it out", () => {
    expect(laterWindow(window(38, 1000), null)).toEqual(window(38, 1000));
    expect(laterWindow(null, window(38, 1000))).toEqual(window(38, 1000));
  });
});

describe("mergePlanLimits", () => {
  test("lays a reading over what is saved, window by window, as of the reading", () => {
    const seen = { ...LIMITS, sevenDay: null, seenAt: NOW + MINUTE };
    expect(mergePlanLimits(LIMITS, seen)).toEqual({ ...LIMITS, seenAt: NOW + MINUTE });
    expect(mergePlanLimits(null, seen)).toEqual(seen);
  });
});

describe("isWorthSaving", () => {
  test("saves the first reading and any change", () => {
    expect(isWorthSaving(null, LIMITS)).toBe(true);
    const moved = {
      ...LIMITS,
      fiveHour: { usedPercent: 24, resetsAt: LIMITS.fiveHour?.resetsAt ?? 0 },
    };
    expect(isWorthSaving(LIMITS, { ...moved, seenAt: NOW + SECOND })).toBe(true);
  });

  test("saves an unchanged reading again only once a minute", () => {
    expect(isWorthSaving(LIMITS, { ...LIMITS, seenAt: NOW + 30 * SECOND })).toBe(false);
    expect(isWorthSaving(LIMITS, { ...LIMITS, seenAt: NOW + MINUTE })).toBe(true);
  });
});

describe("the limits file", () => {
  let dir: string;
  let path: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kairos-limits-"));
    path = join(dir, "plan-limits.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("reads as none when missing or corrupt", () => {
    expect(readPlanLimits(path)).toBeNull();
    writeFileSync(path, "{not json");
    expect(readPlanLimits(path)).toBeNull();
  });

  test("records a status line's limits, and skips one that adds nothing", () => {
    recordPlanLimits(path, statusLine(BOTH), NOW);
    expect(readPlanLimits(path)).toEqual(LIMITS);
    recordPlanLimits(path, statusLine(BOTH), NOW + 10 * SECOND);
    expect(readPlanLimits(path)?.seenAt).toBe(NOW);
  });

  test("doesn't let an idle session's older reading take back what is used", () => {
    recordPlanLimits(path, statusLine(BOTH), NOW);
    const older = { ...BOTH, five_hour: { used_percentage: 10, resets_at: FIVE_RESET_S } };
    recordPlanLimits(path, statusLine(older), NOW + 2 * MINUTE);
    expect(readPlanLimits(path)).toEqual({ ...LIMITS, seenAt: NOW + 2 * MINUTE });
  });

  test("keeps the last limits when a status line has none", () => {
    savePlanLimits(path, LIMITS);
    recordPlanLimits(path, statusLine(undefined), NOW + MINUTE);
    expect(readPlanLimits(path)).toEqual(LIMITS);
  });

  test("throws on input that isn't JSON, for the caller to swallow", () => {
    expect(() => recordPlanLimits(path, "", NOW)).toThrow();
  });

  test("doesn't announce a save that only renews when the limits were seen", async () => {
    savePlanLimits(path, LIMITS);
    let calls = 0;
    const stop = watchPlanLimits(path, () => calls++);
    await Bun.sleep(100);
    savePlanLimits(path, { ...LIMITS, seenAt: NOW + MINUTE });
    await Bun.sleep(400);
    stop();
    expect(calls).toBe(0);
  });

  test("announces a save that changes a window", async () => {
    const saved = new Promise<void>((resolve) => {
      const stop = watchPlanLimits(path, () => {
        stop();
        resolve();
      });
    });
    // The watch takes a moment to start; a save before then goes unseen
    await Bun.sleep(100);
    savePlanLimits(path, LIMITS);
    await saved;
  });
});
