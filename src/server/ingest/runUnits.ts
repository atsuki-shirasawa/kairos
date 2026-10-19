// Which runs of an automated loop are one piece of work: an iteration that implements an issue,
// the run a minute later that opens its PR, and later ones that answer the PR's review all report
// the same issue or PR number, while the loop may move on to another issue in between. Time alone
// can't tell them apart: the loop runs back to back, on one branch, day after day.
import type { RunUnit } from "../../shared/api.ts";
import { namedNumbers } from "./prRefs.ts";

/** An automation run as the rule sees it, in start order. */
export interface UnitRun {
  id: string;
  /** The issue and PR numbers the run named (see `runNumbers`). */
  numbers: number[];
}

/**
 * The numbers a run names: those in the first line of its last reply, where a loop reports what it
 * was on ("opened …/pull/32 for #31"), and those its blocks worked on, opened or merged (`refs`).
 * Only the first line, since the rest of a report may name the next issue or related ones.
 */
export function runNumbers(lastReply: string | null, refNumbers: number[]): number[] {
  const report = lastReply?.trim().split("\n")[0] ?? "";
  return [...new Set([...namedNumbers(report), ...refNumbers])];
}

/** A unit being built: its runs, the numbers its first run and all its runs named, and its tie. */
interface OpenUnit {
  runs: string[];
  first: number[];
  numbers: Set<number>;
  ref: number | null;
}

/**
 * The number that ties `run` to `unit`, if any: one the unit's first run named when it can be (the
 * issue an iteration was on, rather than the PR a later run opened for it), else any of the unit's.
 */
function tie(unit: OpenUnit, run: UnitRun): number | undefined {
  return (
    unit.first.find((n) => run.numbers.includes(n)) ?? run.numbers.find((n) => unit.numbers.has(n))
  );
}

/** The latest of `units` that `run` names a number of, with the number that ties it. */
function unitFor(units: OpenUnit[], run: UnitRun): { unit: OpenUnit; shared: number } | null {
  for (let i = units.length - 1; i >= 0; i--) {
    const unit = units[i];
    const shared = unit ? tie(unit, run) : undefined;
    if (unit && shared !== undefined) return { unit, shared };
  }
  return null;
}

/**
 * The unit of each run of one launch directory (`runs` in start order), null for a run on its own.
 * A run joins the latest unit that any of its numbers was named in, though the loop worked on
 * other issues since (a reply to a PR's review comes when the loop has moved on, and a second try
 * at an issue comes back to it); else it starts a unit. A run that names no number stays alone, so
 * a review answer that only quotes a commit splits nothing. A unit of one run is none.
 */
export function runUnits(runs: readonly UnitRun[]): Map<string, RunUnit | null> {
  const units: OpenUnit[] = [];
  for (const run of runs) {
    if (run.numbers.length === 0) continue;
    const found = unitFor(units, run);
    if (found) {
      found.unit.runs.push(run.id);
      found.unit.ref ??= found.shared;
      for (const n of run.numbers) found.unit.numbers.add(n);
    } else
      units.push({ runs: [run.id], first: run.numbers, numbers: new Set(run.numbers), ref: null });
  }
  const byRun = new Map<string, RunUnit | null>(runs.map((r) => [r.id, null]));
  for (const { runs: ids, ref } of units) {
    const [first] = ids;
    if (first === undefined || ref === null) continue;
    for (const id of ids) byRun.set(id, { id: first, ref });
  }
  return byRun;
}
