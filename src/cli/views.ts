// What `kairos report`, `open-items` and `search` print, built from the same data the API serves.
// Kept free of I/O so the output can be tested on plain objects.
import type { CalendarSession, LedgerEntry, Project, SearchHit } from "../shared/api.ts";
import { prMarkdownLink } from "../shared/artifacts.ts";
import { hhmm, isoDay, startOfDay } from "../shared/dates.ts";
import { isOpenAt } from "../shared/openItems.ts";
import { formatTime, oneLine, printable, uiLink } from "./format.ts";
import { visibleOnly } from "./projects.ts";
import { styles } from "./style.ts";

/** Shown for work outside any project, where the UI says "unknown project". */
const NO_PROJECT = "(no project)";

/** One work block in a report. */
export interface ReportBlock {
  sessionId: string;
  start: number;
  end: number;
  headline: string;
  /** The summary body (Markdown); null until one is written. */
  body: string | null;
  /** PR URLs opened during the block. */
  prs: string[];
}

/** One day of a report: its blocks per project, in the order work started. */
export interface ReportDay {
  /** Local midnight. */
  day: number;
  projects: { name: string; blocks: ReportBlock[] }[];
}

/** An item still open at the end of the report's period. */
export interface ReportOpenItem {
  project: string;
  kind: string | null;
  text: string;
  /** End of the block that left it open. */
  openedAt: number;
}

/** A period of work, as `kairos report` prints it (or as JSON with `--json`). */
export interface Report {
  from: number;
  to: number;
  days: ReportDay[];
  /** Open items of the projects in the report that were still open when the period ended. */
  openItems: ReportOpenItem[];
}

/** A project's display name, or the placeholder for work outside any project. */
function projectName(projects: ReadonlyMap<number, Project>, id: number | null): string {
  return (id !== null ? projects.get(id)?.name : undefined) ?? NO_PROJECT;
}

/** Days [from, to) as local midnights. */
function daysIn(from: number, to: number): number[] {
  const days: number[] = [];
  for (let day = startOfDay(from); day < to; day = startOfDay(day, 1)) days.push(day);
  return days;
}

/**
 * Groups the blocks that started in [from, to) by day and project, like the UI's copied report.
 * A block that runs past midnight is listed on the day it started only. Hidden projects' sessions
 * are left out here, so no caller can leak them; open items are kept only for projects that have
 * a block here.
 */
export function buildReport(
  from: number,
  to: number,
  sessions: CalendarSession[],
  projects: ReadonlyMap<number, Project>,
  openItems: LedgerEntry[],
): Report {
  // Headless runs come back only while the UI shows them, so the report follows that setting
  const blocks = visibleOnly(sessions, projects)
    .flatMap((s) =>
      s.segments
        .filter((g) => g.start >= from && g.start < to)
        .map((g) => ({
          project: projectName(projects, s.projectId),
          block: {
            sessionId: s.id,
            start: g.start,
            end: g.end,
            headline: g.headline,
            body: g.body,
            prs: g.prs.map((a) => a.ref),
          },
        })),
    )
    .sort((a, b) => a.block.start - b.block.start);

  const days = daysIn(from, to).flatMap((day) => {
    const next = startOfDay(day, 1);
    const ofDay = blocks.filter((b) => b.block.start >= day && b.block.start < next);
    if (ofDay.length === 0) return [];
    const byProject = Map.groupBy(ofDay, (b) => b.project);
    return [
      {
        day,
        projects: [...byProject].map(([name, list]) => ({
          name,
          blocks: list.map((b) => b.block),
        })),
      },
    ];
  });

  const names = new Set(blocks.map((b) => b.project));
  return {
    from,
    to,
    days,
    openItems: openItems
      .filter((i) => isOpenAt(i, to))
      .map((i) => ({
        project: projectName(projects, i.projectId),
        kind: i.kind,
        text: i.text,
        openedAt: i.openedAt,
      }))
      .filter((i) => names.has(i.project)),
  };
}

/** `2026-10-13 (Tue)`. Weekdays are in English, like the rest of the CLI's output. */
function dayLabel(day: number): string {
  return `${isoDay(day)} (${new Date(day).toLocaleDateString("en-US", { weekday: "short" })})`;
}

/** An open item as one list line: its kind tag, then the text. */
function openItemLine(kind: string | null, text: string): string {
  return `- ${kind ? `[${kind}] ` : ""}${oneLine(text)}`;
}

/**
 * The report as Markdown, for a stand-up note, Slack or a ticket. With `full`, each block's summary
 * body follows it, indented under its line.
 */
export function renderReport(report: Report, full = false): string {
  if (report.days.length === 0) return "No work in this period.";
  const last = startOfDay(report.to, -1);
  const period =
    startOfDay(report.from) === last ? isoDay(last) : `${isoDay(report.from)} – ${isoDay(last)}`;
  const out = [`# Work report: ${period}`, ""];
  for (const day of report.days) {
    out.push(`## ${dayLabel(day.day)}`, "");
    for (const project of day.projects) {
      out.push(`### ${printable(project.name)}`, "");
      for (const b of project.blocks) {
        const prs = b.prs.length ? ` (${b.prs.map(prMarkdownLink).join(", ")})` : "";
        out.push(`- ${hhmm(b.start)}–${hhmm(b.end)} ${oneLine(b.headline)}${prs}`);
        if (full && b.body)
          for (const line of b.body.trim().split("\n")) out.push(`  ${printable(line)}`);
      }
      out.push("");
    }
  }
  if (report.openItems.length) {
    out.push("## Open items", "");
    for (const [name, items] of Map.groupBy(report.openItems, (i) => i.project)) {
      out.push(`### ${printable(name)}`, "", ...items.map((i) => openItemLine(i.kind, i.text)), "");
    }
  }
  return out.join("\n").trim();
}

/**
 * Open items (hidden projects already left out), grouped by project, as Markdown (it may be read
 * by Claude from a hook).
 */
export function renderOpenItems(
  items: LedgerEntry[],
  projects: ReadonlyMap<number, Project>,
): string {
  if (items.length === 0) return "No open items.";
  const out: string[] = [];
  for (const [name, list] of Map.groupBy(items, (i) => projectName(projects, i.projectId))) {
    out.push(`## ${printable(name)}`, "");
    for (const i of list)
      out.push(`${openItemLine(i.kind, i.text)} (left open ${isoDay(i.openedAt)})`);
    out.push("");
  }
  return out.join("\n").trim();
}

/**
 * Search hits (hidden projects already left out), newest first: when and where, what matched, and
 * a link that opens the block. With color, the headline stands out and the rest recedes.
 */
export function renderSearch(
  hits: SearchHit[],
  more: boolean,
  projects: ReadonlyMap<number, Project>,
  base: string,
  color = false,
): string {
  if (hits.length === 0) return "No matches.";
  const { bold, dim } = styles(color);
  const out = hits.flatMap((h) => [
    `${dim(formatTime(h.start))}  ${bold(printable(projectName(projects, h.projectId)))}  ${oneLine(h.headline)}`,
    ...(h.snippet ? [`  ${dim(`${h.field}:`)} ${oneLine(h.snippet)}`] : []),
    `  ${dim(uiLink(base, { day: startOfDay(h.start), session: h.sessionId, start: h.start }))}`,
    "",
  ]);
  if (more) out.push(dim("More sections matched; add terms or raise --limit."));
  return out.join("\n").trim();
}
