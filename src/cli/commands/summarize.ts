// `kairos summarize`: summarizes every finished block that has none yet, one `claude -p` at a time,
// with a status bar while it runs. Each step is its own function; the command lists them.
import type { Database } from "bun:sqlite";
import { SUMMARIZER_CWD } from "../../server/paths.ts";
import type { BackfillResult } from "../../server/summarize/backfill.ts";
import type { NamedTarget, TargetFilter } from "../../server/summarize/store.ts";
import type { Summarizer } from "../../server/summarize/summarizer.ts";
import { DAY } from "../../shared/dates.ts";
import { AUTO_SUMMARY_DAYS } from "../../shared/sections.ts";
import { printable } from "../../shared/text.ts";
import { type CliContext, periodRange, type SummaryOptions } from "../args.ts";
import { health, serverEnv } from "../daemon.ts";
import { CliError } from "../errors.ts";
import { formatTime } from "../format.ts";
import { colorFor } from "../style.ts";
import { catchUp } from "./ingest.ts";

/** The exit code of a run stopped with Ctrl+C, as shells report SIGINT. */
const INTERRUPTED_EXIT = 130;

/** The blocks this run summarizes, and where the running server's own range begins. */
export interface Selection {
  targets: NamedTarget[];
  /**
   * Blocks that ended at or after this time are left to the running server, which summarizes
   * them itself; absent when no server does.
   */
  leftToServer?: number;
}

/** Which blocks `kairos summarize` covers, from `--since` / `--until` / `--limit`. */
export function summarizeFilter(ctx: Pick<CliContext, "period" | "limit">): TargetFilter {
  const { from, to } = periodRange(ctx.period);
  return {
    ...(from !== undefined ? { startFrom: from } : {}),
    ...(to !== undefined ? { startBefore: to } : {}),
    ...(ctx.limit ? { limit: ctx.limit } : {}),
  };
}

/**
 * The blocks to summarize. While a server summarizes on its own, its recent days are left out:
 * taking them too would run `claude -p` twice for the same block.
 */
export async function selectTargets(
  db: Database,
  filter: TargetFilter,
  serverSummarizes: boolean,
  now: number,
): Promise<Selection> {
  const { findTargets } = await import("../../server/summarize/store.ts");
  const leftToServer = serverSummarizes ? now - AUTO_SUMMARY_DAYS * DAY : undefined;
  const targets = findTargets(db, now, {
    ...filter,
    ...(leftToServer !== undefined ? { endedBefore: leftToServer } : {}),
  });
  return { targets, ...(leftToServer !== undefined ? { leftToServer } : {}) };
}

/**
 * What the run is about to do: which days are left to the server, then how many blocks wait and
 * how many get a full summary, or that none wait. `narrowed` says whether options limited the
 * range, which changes how "none" reads.
 */
export function describeTargets(selection: Selection, narrowed: boolean): string[] {
  const { targets, leftToServer } = selection;
  const lines: string[] = [];
  if (leftToServer !== undefined)
    lines.push(
      `Kairos is running, so blocks from the last ${AUTO_SUMMARY_DAYS} days are left to its own summaries.`,
    );
  if (targets.length === 0) {
    lines.push(
      narrowed || leftToServer !== undefined
        ? "No block in that range is waiting for a summary."
        : "Every finished block already has a summary.",
    );
    return lines;
  }
  const titles = targets.filter((t) => t.mode === "title").length;
  const oldest = formatTime(Math.min(...targets.map((t) => t.start))).slice(0, 10);
  const newest = formatTime(Math.max(...targets.map((t) => t.start))).slice(0, 10);
  lines.push(
    `${targets.length} blocks without a summary (${oldest} – ${newest}): ` +
      `${targets.length - titles} full summaries, ${titles} headlines only`,
  );
  return lines;
}

/** A summarizer that runs `claude -p` with the given options, quietly (the status bar reports). */
async function createSummarizer(db: Database, options: SummaryOptions): Promise<Summarizer> {
  const { claudeRunner } = await import("../../server/summarize/claude.ts");
  const { DEFAULT_MODEL, Summarizer } = await import("../../server/summarize/summarizer.ts");
  const model = options.model ?? DEFAULT_MODEL;
  const cwd = SUMMARIZER_CWD;
  // This may run inside a Claude Code session (e.g. via `!`), whose variables must not reach claude -p
  const env = serverEnv();
  const effort = options.effort ? { effort: options.effort } : {};
  return new Summarizer(db, claudeRunner({ model, cwd, env, ...effort }), {
    model,
    quiet: true,
    ...(options.lang ? { lang: options.lang } : {}),
  });
}

/** Where a block is, as progress lines and the status bar show it. */
function where(t: NamedTarget): string {
  return `${formatTime(t.start)}  ${printable(t.project ?? "-")}`;
}

/**
 * Summarizes the targets one by one under a status bar, logging a line per block. Ctrl+C removes
 * the bar and ends the process; what was saved stays saved.
 */
async function runBackfill(
  db: Database,
  summarizer: Summarizer,
  targets: NamedTarget[],
): Promise<BackfillResult> {
  const { backfill } = await import("../../server/summarize/backfill.ts");
  const { StatusBar } = await import("../progress.ts");
  const bar = new StatusBar(process.stdout, targets.length, colorFor(process.stdout));
  process.once("SIGINT", () => {
    bar.close();
    console.log("Interrupted. What was summarized is saved; run it again to do the rest.");
    // A signal handler can't hand an error back to the entry point, so it ends the process here
    process.exit(INTERRUPTED_EXIT);
  });
  const width = String(targets.length).length;
  const result = await backfill(db, summarizer, targets, {
    onStart: (t) => bar.begin(where(t)),
    onProgress: (p) => {
      bar.log(
        `[${String(p.index).padStart(width)}/${p.total}] ${p.status.padEnd(7)} ` +
          `${where(p.target)}  ${printable(p.detail ?? "")}`,
      );
      bar.advance(p.status === "failed");
    },
  });
  bar.close();
  return result;
}

/** The line that closes a run: how long it took and how each block went. */
export function formatOutcome(counts: BackfillResult["counts"], durationText: string): string {
  return (
    `Done in ${durationText}: ${counts.summary} summarized, ` +
    `${counts.title} headline only, ${counts.skipped} skipped, ${counts.failed} failed`
  );
}

/** `kairos summarize`: summarizes the blocks still without a summary, newest first. */
export async function summarizeCommand(ctx: CliContext): Promise<undefined> {
  const { openDb } = await import("../../server/db/index.ts");
  const db = openDb(ctx.dbPath);
  const server = await health(ctx.port);
  await catchUp(db, ctx.claudeDir, server !== null);
  const selection = await selectTargets(
    db,
    summarizeFilter(ctx),
    server?.autoSummary === true,
    Date.now(),
  );
  const narrowed = Boolean(ctx.period.since || ctx.period.until);
  for (const line of describeTargets(selection, narrowed)) console.log(line);
  if (selection.targets.length === 0 || ctx.dryRun) {
    db.close();
    return;
  }

  const { formatDuration } = await import("../progress.ts");
  const summarizer = await createSummarizer(db, ctx.summary);
  const started = performance.now();
  const result = await runBackfill(db, summarizer, selection.targets);
  db.close();
  console.log(formatOutcome(result.counts, formatDuration(performance.now() - started)));
  if (result.abortedBy) throw new CliError(`Stopped after repeated failures: ${result.abortedBy}`);
  if (server) console.log("Reload Kairos in the browser to see the new summaries.");
}
