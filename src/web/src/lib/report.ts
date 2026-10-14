// The shown period as Markdown, for pasting into a daily stand-up note, Slack or a ticket.
import type { CalendarSession, Project } from "@shared/api.ts";
import { prMarkdownLink } from "@shared/artifacts.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { dateLabel, hhmm } from "./dates.ts";
import { blocksOfDay, type DayBlock } from "./dayBlocks.ts";
import { projectName } from "./selection.ts";
import { counted } from "./totals.ts";

/**
 * One section per day and one list per project, in the order work started. Each line is a
 * block's time and headline, followed by its PR links. Blocks that continue from the previous
 * day are listed only on the day they started. Days without work are left out.
 * Projects with a written recap get it first, under a summary heading, so a weekly report reads
 * top-down: what was done, then the details. Recaps of projects not in the report are left out.
 */
export function buildReport(
  days: number[],
  sessions: CalendarSession[],
  projects: Map<number, Project>,
  recaps: ReadonlyMap<number, string> = new Map(),
): string {
  const shown = new Set(
    days.flatMap((day) =>
      blocksOfDay(sessions, day)
        .filter(counted)
        .map((b) => b.session.projectId),
    ),
  );
  const out = recapSection([...shown], projects, recaps);
  for (const day of days) {
    const blocks = blocksOfDay(sessions, day).filter(counted);
    if (blocks.length === 0) continue;
    const byProject = Map.groupBy(blocks, (b) => projectName(projects, b.session.projectId));
    out.push(`## ${dateLabel(day)}`, "");
    for (const [name, list] of byProject) {
      out.push(`### ${name}`, "");
      for (const b of list) out.push(blockLine(b));
      out.push("");
    }
  }
  return out.join("\n").trim();
}

/**
 * The report's opening section: each shown project's written recap under its name, in the order
 * given. No lines at all when none of them has a recap.
 */
export function recapSection(
  projectIds: (number | null)[],
  projects: Map<number, Project>,
  recaps: ReadonlyMap<number, string>,
): string[] {
  const f = formatMessages();
  const summary = projectIds.flatMap((id) => {
    const body = id !== null ? recaps.get(id)?.trim() : undefined;
    return id !== null && body ? [[projectName(projects, id), body]] : [];
  });
  if (summary.length === 0) return [];
  const out = [`## ${f.reportSummary}`, ""];
  for (const [name, body] of summary) out.push(`### ${name}`, "", body ?? "", "");
  return out;
}

/** One block as a list item: its time, its headline on one line, then links to the PRs it opened. */
export function blockLine(b: DayBlock): string {
  const prs = b.segment.prs.map((a) => prMarkdownLink(a.ref));
  const time = `${hhmm(b.dayStart + b.start)}–${hhmm(b.segment.end)}`;
  const headline = b.segment.headline.replace(/\s+/g, " ").trim();
  return `- ${time} ${headline}${prs.length ? ` (${prs.join(", ")})` : ""}`;
}
