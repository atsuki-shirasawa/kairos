// The filter in the page URL: reading it back from a link and writing the set conditions out.
import { type Filter, MIN_LENGTHS, OUTCOMES, STATES } from "./filter.ts";

/**
 * The filter from URL parameters. Unknown values are dropped, so an edited or old link still
 * opens. `outcome=1` is the old "commit or PR" switch.
 */
export function readFilter(q: URLSearchParams): Filter {
  const list = <T extends string>(key: string, allowed: readonly T[]): T[] =>
    (q.get(key) ?? "").split(",").filter((v): v is T => (allowed as readonly string[]).includes(v));
  const outcome = q.get("outcome");
  const minMinutes = Number(q.get("len"));
  return {
    q: q.get("q") ?? "",
    qFiles: q.get("in") === "files",
    outcomes: outcome === "1" ? ["commit", "pr"] : list("outcome", OUTCOMES),
    states: list("state", STATES),
    minMinutes: (MIN_LENGTHS as readonly number[]).includes(minMinutes) ? minMinutes : 0,
    branch: q.get("branch") || null,
    hideBrief: q.get("brief") === "hide",
  };
}

/** Writes the filter's set conditions into URL parameters (unset ones are left out). */
export function writeFilter(f: Filter, q: URLSearchParams): void {
  if (f.q) q.set("q", f.q);
  if (f.qFiles) q.set("in", "files");
  if (f.outcomes.length) q.set("outcome", OUTCOMES.filter((o) => f.outcomes.includes(o)).join(","));
  if (f.states.length) q.set("state", STATES.filter((s) => f.states.includes(s)).join(","));
  if (f.minMinutes) q.set("len", String(f.minMinutes));
  if (f.branch) q.set("branch", f.branch);
  if (f.hideBrief) q.set("brief", "hide");
}
