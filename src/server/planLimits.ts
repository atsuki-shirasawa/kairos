// The plan's usage limits: taken from Claude Code's status line input by `kairos statusline`, kept
// in a small file in the data directory, and read by the server for the live page. Session logs
// don't carry them, and asking the API would spend the quota being measured.
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { PLAN_WINDOW_KINDS, type PlanLimits, type PlanWindow } from "../shared/api.ts";
import { MINUTE, SECOND } from "../shared/dates.ts";
import { watchDirectory } from "./dirWatch.ts";
import { asRecord } from "./json.ts";

/**
 * The status line runs on every update of every session, so an unchanged reading is written again
 * only this often: often enough that `seenAt` says whether Claude Code is still reporting.
 */
const RESAVE_MS = MINUTE;
/** A save is a rename, which some platforms report as more than one event. */
const DEBOUNCE_MS = 200;

/**
 * One window from the status line's `rate_limits` (`used_percentage`, `resets_at` in seconds), or
 * null when it is missing or malformed.
 */
function statusLineWindow(value: unknown): PlanWindow | null {
  const w = asRecord(value);
  const used = w?.used_percentage;
  const resets = w?.resets_at;
  if (typeof used !== "number" || !Number.isFinite(used)) return null;
  if (typeof resets !== "number" || !Number.isFinite(resets)) return null;
  return { usedPercent: used, resetsAt: resets * SECOND };
}

/**
 * The limits in Claude Code's status line input, seen at `seenAt`; null when it has none (an API
 * key rather than a plan, or a session before its first response).
 */
export function limitsFromStatusLine(input: unknown, seenAt: number): PlanLimits | null {
  const limits = asRecord(asRecord(input)?.rate_limits);
  const fiveHour = statusLineWindow(limits?.five_hour);
  const sevenDay = statusLineWindow(limits?.seven_day);
  if (!fiveHour && !sevenDay) return null;
  return { fiveHour, sevenDay, seenAt };
}

/** A window as saved, or null when it isn't one. */
function savedWindow(value: unknown): PlanWindow | null {
  const w = asRecord(value);
  if (typeof w?.usedPercent !== "number" || typeof w.resetsAt !== "number") return null;
  return { usedPercent: w.usedPercent, resetsAt: w.resetsAt };
}

/** Saved limits read back, or null when the file holds something else. */
export function parsePlanLimits(value: unknown): PlanLimits | null {
  const v = asRecord(value);
  if (typeof v?.seenAt !== "number") return null;
  return { fiveHour: savedWindow(v.fiveHour), sevenDay: savedWindow(v.sevenDay), seenAt: v.seenAt };
}

/** The limits last saved at `path`, or null when there are none or they can't be read. */
export function readPlanLimits(path: string): PlanLimits | null {
  try {
    return parsePlanLimits(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

/**
 * The later of two readings of a window. Each session reports the limits from its own last
 * response, so an idle session's status line can carry an older reading than one saved from a
 * busy session: a window that resets later is a newer window, and within one window usage only
 * grows. A window left out keeps the one saved, which the UI shows as reset once its time passes.
 */
export function laterWindow(saved: PlanWindow | null, seen: PlanWindow | null): PlanWindow | null {
  if (!saved || !seen) return seen ?? saved;
  if (seen.resetsAt !== saved.resetsAt) return seen.resetsAt > saved.resetsAt ? seen : saved;
  return seen.usedPercent >= saved.usedPercent ? seen : saved;
}

/** A status line's reading laid over the saved one, window by window (`laterWindow`). */
export function mergePlanLimits(saved: PlanLimits | null, seen: PlanLimits): PlanLimits {
  if (!saved) return seen;
  return {
    fiveHour: laterWindow(saved.fiveHour, seen.fiveHour),
    sevenDay: laterWindow(saved.sevenDay, seen.sevenDay),
    seenAt: seen.seenAt,
  };
}

/** Whether two readings say the same about every window, whenever they were taken. */
export function sameWindows(a: PlanLimits | null, b: PlanLimits | null): boolean {
  const windows = (l: PlanLimits | null) => JSON.stringify(PLAN_WINDOW_KINDS.map((k) => l?.[k]));
  return windows(a) === windows(b);
}

/** Whether `next` should replace `prev`: it says something new, or `prev` is getting old. */
export function isWorthSaving(prev: PlanLimits | null, next: PlanLimits): boolean {
  if (!prev) return true;
  return !sameWindows(prev, next) || next.seenAt - prev.seenAt >= RESAVE_MS;
}

/**
 * Writes the limits to `path` through a temporary file and a rename, so the server never reads a
 * half-written file while several sessions' status lines save at once.
 */
export function savePlanLimits(path: string, limits: PlanLimits): void {
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(limits));
    renameSync(tmp, path);
  } catch (e) {
    // Each status line run has its own pid, so a failed save would leave a file per run
    rmSync(tmp, { force: true });
    throw e;
  }
}

/**
 * Records the limits in a status line input (its raw JSON text) at `path`, merged into what is
 * saved, unless it has none or they add nothing. Throws on unreadable input or a failed write.
 */
export function recordPlanLimits(path: string, statusLineJson: string, now: number): void {
  const seen = limitsFromStatusLine(JSON.parse(statusLineJson), now);
  if (!seen) return;
  const saved = readPlanLimits(path);
  const next = mergePlanLimits(saved, seen);
  if (isWorthSaving(saved, next)) savePlanLimits(path, next);
}

/**
 * Calls `onChange` when a save at `path` changes a window. A save that only renews `seenAt` says
 * nothing new, and the UI's own periodic refetch picks up its age. It watches the directory, since
 * each save replaces the file. Returns a function that stops watching.
 */
export function watchPlanLimits(path: string, onChange: () => void): () => void {
  const name = basename(path);
  let last = readPlanLimits(path);
  const reread = () => {
    const now = readPlanLimits(path);
    if (sameWindows(last, now)) return;
    last = now;
    onChange();
  };
  return watchDirectory(dirname(path), reread, {
    debounceMs: DEBOUNCE_MS,
    only: (file) => file === name,
  });
}
