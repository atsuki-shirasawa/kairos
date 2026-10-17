// A period of work as Markdown, for a stand-up note, Slack or a ticket. `kairos report` prints it and
// the web app copies it; both build it here, so the same range gives the same text. Only the
// labels (the title, day headings, section names) follow the reader's language.
import type { CalendarSession, LedgerEntry, Project } from "./api.ts";
import { prMarkdownLink } from "./artifacts.ts";
import { hhmm, isoDay, startOfDay } from "./dates.ts";
import { isOpenAt } from "./openItems.ts";
import { isProjectShown } from "./projects.ts";
import { printable, printableLine } from "./text.ts";

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

/** A project in a report; `name` is null for work outside any project. */
export interface ReportProject {
  projectId: number | null;
  name: string | null;
}

/** One day of a report: its blocks per project, in the order work started. */
export interface ReportDay {
  /** Local midnight. */
  day: number;
  projects: (ReportProject & { blocks: ReportBlock[] })[];
}

/** A project's written recap of the report's period. */
export interface ReportRecap extends ReportProject {
  /** Markdown. */
  body: string;
}

/** An item still open at the end of the report's period. */
export interface ReportOpenItem extends ReportProject {
  kind: string | null;
  text: string;
  /** End of the block that left it open. */
  openedAt: number;
}

/** A period of work, as `kairos report` prints it (or as JSON with `--json`) and the UI copies it. */
export interface Report {
  from: number;
  to: number;
  /** Recaps of the projects with work in the report, in the order their work started. */
  recaps: ReportRecap[];
  days: ReportDay[];
  /** Open items of the projects in the report that were still open when the period ended. */
  openItems: ReportOpenItem[];
}

/** What a report is built from: the period's sessions, and its projects' recaps and open items. */
export interface ReportInput {
  from: number;
  to: number;
  sessions: readonly CalendarSession[];
  projects: ReadonlyMap<number, Project>;
  /** Items open at its end (`reportOpenItemsRange`); those closed by then are dropped. */
  openItems?: readonly LedgerEntry[];
  /** Recaps of the period; unwritten ones (null body) are skipped. */
  recaps?: readonly { projectId: number; body: string | null }[];
}

/**
 * The range whose open items a report lists: its last moment, so `isOpenAt` keeps the ones still
 * open when it ended. The CLI and the UI fetch the same, so they list the same items.
 */
export function reportOpenItemsRange(to: number): { from: number; to: number } {
  return { from: to - 1, to };
}

/** A project of the report by id: its name, or null outside any project. */
function reportProject(projects: ReadonlyMap<number, Project>, id: number | null): ReportProject {
  return { projectId: id, name: id !== null ? (projects.get(id)?.name ?? null) : null };
}

/** The blocks that started in [from, to), with their project, in the order they started. */
function blocksIn({ from, to, sessions, projects }: ReportInput) {
  return sessions
    .filter((s) => isProjectShown(projects, s.projectId))
    .flatMap((s) =>
      s.segments
        .filter((g) => g.start >= from && g.start < to)
        .map((g) => ({
          projectId: s.projectId,
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
}

/**
 * The period's work by day and project. A block that runs past midnight is listed on the day it
 * started only. Hidden projects' work is left out here, so no caller can leak it; recaps and open
 * items are kept only for projects that have a block here.
 */
export function buildReport(input: ReportInput): Report {
  const { from, to, projects } = input;
  const blocks = blocksIn(input);
  // Blocks are in start order, so the days and each day's projects come out in order too
  const byDay = Map.groupBy(blocks, (b) => startOfDay(b.block.start));
  const days = [...byDay].map(([day, ofDay]) => ({
    day,
    projects: [...Map.groupBy(ofDay, (b) => b.projectId)].map(([id, of]) => ({
      ...reportProject(projects, id),
      blocks: of.map((b) => b.block),
    })),
  }));
  const order = [...new Set(blocks.map((b) => b.projectId))];
  const recapBody = new Map((input.recaps ?? []).map((r) => [r.projectId, r.body?.trim()]));
  return {
    from,
    to,
    recaps: order.flatMap((id) => {
      const body = id !== null ? recapBody.get(id) : undefined;
      return body ? [{ ...reportProject(projects, id), body }] : [];
    }),
    days,
    openItems: (input.openItems ?? [])
      .filter((i) => isOpenAt(i, to) && order.includes(i.projectId))
      .map((i) => ({
        ...reportProject(projects, i.projectId),
        kind: i.kind,
        text: i.text,
        openedAt: i.openedAt,
      })),
  };
}

/** The words a rendered report uses, in the reader's language (a type, so i18n can hold it). */
export type ReportLabels = {
  /** The title line: the first and last day of the period (the same day for one day). */
  title: (first: number, last: number) => string;
  /** A day's heading. */
  day: (day: number) => string;
  /** Heading of the recaps. */
  summary: string;
  /** Heading of the open items. */
  openItems: string;
  /** Work outside any project. */
  noProject: string;
  /** The whole text when the period has no work. */
  noWork: string;
};

/** A report's period as its first and last day (`2026-10-12 – 2026-10-13`), or the one day. */
export function reportPeriod(first: number, last: number): string {
  return first === last ? isoDay(last) : `${isoDay(first)} – ${isoDay(last)}`;
}

/** How the CLI names work outside any project, in reports and other views. */
export const NO_PROJECT_NAME = "(no project)";

/** The CLI's labels, which the UI also uses in English, so both give the same text. */
export const ENGLISH_REPORT_LABELS: ReportLabels = {
  title: (first, last) => `Work report: ${reportPeriod(first, last)}`,
  day: (day) =>
    `${isoDay(day)} (${new Date(day).toLocaleDateString("en-US", { weekday: "short" })})`,
  summary: "Summary",
  openItems: "Open items",
  noProject: NO_PROJECT_NAME,
  noWork: "No work in this period.",
};

/** Multi-line Markdown kept multi-line, each line without control characters. */
function printableLines(text: string): string[] {
  return text.trim().split("\n").map(printable);
}

/** One block as a list item: its time, its headline on one line, then links to the PRs it opened. */
function blockLine(b: ReportBlock): string {
  const prs = b.prs.length ? ` (${b.prs.map(prMarkdownLink).join(", ")})` : "";
  return `- ${hhmm(b.start)}–${hhmm(b.end)} ${printableLine(b.headline)}${prs}`;
}

/** An open item as one list line: its kind tag, then the text. */
export function openItemLine(i: { kind: string | null; text: string }): string {
  return `- ${i.kind ? `[${i.kind}] ` : ""}${printableLine(i.text)}`;
}

/**
 * The report as Markdown: a title, the written recaps under a summary heading (so a weekly report
 * reads top-down), each day's blocks per project, then what is still open. With `full`, each
 * block's summary body follows it, indented under its line.
 */
export function renderReport(
  report: Report,
  { labels = ENGLISH_REPORT_LABELS, full = false }: { labels?: ReportLabels; full?: boolean } = {},
): string {
  if (report.days.length === 0) return labels.noWork;
  const name = (p: ReportProject) => printable(p.name ?? labels.noProject);
  const out = [`# ${labels.title(startOfDay(report.from), startOfDay(report.to, -1))}`, ""];
  if (report.recaps.length) {
    out.push(`## ${labels.summary}`, "");
    for (const r of report.recaps) out.push(`### ${name(r)}`, "", ...printableLines(r.body), "");
  }
  for (const day of report.days) {
    out.push(`## ${labels.day(day.day)}`, "");
    for (const project of day.projects) {
      out.push(`### ${name(project)}`, "");
      for (const b of project.blocks) {
        out.push(blockLine(b));
        if (full && b.body) for (const line of printableLines(b.body)) out.push(`  ${line}`);
      }
      out.push("");
    }
  }
  if (report.openItems.length) {
    out.push(`## ${labels.openItems}`, "");
    for (const items of Map.groupBy(report.openItems, (i) => i.projectId).values())
      out.push(`### ${name(items[0] as ReportOpenItem)}`, "", ...items.map(openItemLine), "");
  }
  return out.join("\n").trim();
}
