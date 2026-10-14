// The commands that read the DB and print what is in it: report, open-items and search. Rendering
// lives in `views.ts`; these choose what to read and hand it over.
import { resolve } from "node:path";
import type { Project } from "../../shared/api.ts";
import { startOfDay } from "../../shared/dates.ts";
import { isProjectShown } from "../../shared/projects.ts";
import { type CliContext, type DayOption, dayArg } from "../args.ts";
import { health } from "../daemon.ts";
import { CliError, UsageError } from "../errors.ts";
import { colorFor } from "../style.ts";
import { catchUp } from "./ingest.ts";

/** Opens the DB for a read-only command, after catching up on the logs if needed. */
async function openForRead(ctx: CliContext) {
  const { openDb } = await import("../../server/db/index.ts");
  const { Queries } = await import("../../server/queries/index.ts");
  const db = openDb(ctx.dbPath);
  await catchUp(db, ctx.claudeDir, (await health(ctx.port)) !== null);
  return { db, q: new Queries(db) };
}

/**
 * The period [from, to) `kairos report` covers: the day given, else `--since` / `--until`. Without
 * `--since` it is one day: the `--until` day, or today.
 */
export function reportPeriod(
  day: number | undefined,
  since: DayOption | undefined,
  until: DayOption | undefined,
  now: number,
): { from: number; to: number } {
  const to =
    day !== undefined ? startOfDay(day, 1) : until ? startOfDay(until.day, 1) : startOfDay(now, 1);
  const from = day ?? since?.day ?? startOfDay(to, -1);
  // `--since` after `--until` is refused while reading the options, so only today can be passed
  if (to <= from) throw new UsageError(`--since (${since?.text}) is after today`, "report");
  return { from, to };
}

/** The day `kairos report` was given as an argument, if any; it takes one, or the period options. */
function reportDay(ctx: CliContext): number | undefined {
  const [first, ...more] = ctx.args;
  if (more.length > 0) throw new UsageError("Give at most one day", "report");
  if (first === undefined) return undefined;
  if (ctx.period.since || ctx.period.until)
    throw new UsageError("Give a day or --since / --until, not both", "report");
  return dayArg(first, ctx.command);
}

/** `kairos report`: a day (default today) or `--since` / `--until`, as Markdown or JSON. */
export async function reportCommand(ctx: CliContext): Promise<undefined> {
  const day = reportDay(ctx);
  const { from, to } = reportPeriod(day, ctx.period.since, ctx.period.until, Date.now());
  const { buildReport, renderReport } = await import("../views.ts");
  const { db, q } = await openForRead(ctx);
  const projects = new Map(q.projects().map((p) => [p.id, p]));
  // Items open at the period's last moment; buildReport drops the ones closed by then
  const r = buildReport(from, to, q.calendar(from, to), projects, q.openItems(to - 1, to));
  db.close();
  console.log(ctx.json ? JSON.stringify(r, null, 2) : renderReport(r, ctx.full));
}

/**
 * The project a `--project` value names: a path inside it (`.` for here, relative to `cwd`), or
 * its name. The longest path wins, so a project nested inside another's directory is found as
 * itself.
 */
export function findProject(projects: readonly Project[], value: string, cwd: string): Project {
  const path = value === "." || value.includes("/") ? resolve(cwd, value) : null;
  const match = path
    ? projects
        .filter((p) => path === p.path || path.startsWith(`${p.path}/`))
        .sort((a, b) => b.path.length - a.path.length)[0]
    : projects.find((p) => p.name.toLowerCase() === value.toLowerCase());
  if (!match) throw new CliError(`No project matches ${value}`);
  return match;
}

/** `kairos open-items`: what is still open, for every project or one. */
export async function openItemsCommand(ctx: CliContext): Promise<undefined> {
  const { renderOpenItems } = await import("../views.ts");
  const { db, q } = await openForRead(ctx);
  const list = q.projects();
  const project = ctx.project ? findProject(list, ctx.project, process.cwd()) : undefined;
  const projects = new Map(list.map((p) => [p.id, p]));
  const now = Date.now();
  const items = q
    .openItems(now, now + 1)
    .filter((i) => i.closedAt === null && (!project || i.projectId === project.id));
  db.close();
  if (ctx.json) {
    const shown = items.filter((i) => isProjectShown(projects, i.projectId));
    console.log(JSON.stringify(shown, null, 2));
  } else console.log(renderOpenItems(items, projects));
}

/** `kairos search`: work blocks matching every term, newest first, with links into the UI. */
export async function searchCommand(ctx: CliContext): Promise<undefined> {
  const query = ctx.args.join(" ").trim();
  if (!query) throw new UsageError("Give something to search for", "search");
  const { renderSearch } = await import("../views.ts");
  const { db, q } = await openForRead(ctx);
  const projects = new Map(q.projects().map((p) => [p.id, p]));
  const { hits, more } = q.search(query, ctx.limit);
  db.close();
  const shown = hits.filter((h) => isProjectShown(projects, h.projectId));
  console.log(
    ctx.json
      ? JSON.stringify({ hits: shown, more }, null, 2)
      : renderSearch(shown, more, projects, ctx.url, colorFor(process.stdout)),
  );
}
