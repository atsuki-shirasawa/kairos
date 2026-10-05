// The shown period as Markdown, for pasting into a daily stand-up note, Slack or a ticket.
import type { CalendarSession, Project } from "@shared/api.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { dateLabel, hhmm } from "./dates.ts";
import { blocksOfDay } from "./layout.ts";
import { counted } from "./totals.ts";

/**
 * One section per day and one list per project, in the order work started. Each line is a
 * block's time and headline, followed by its PR links. Blocks that continue from the previous
 * day are listed only on the day they started. Days without work are left out.
 */
export function buildReport(
  days: number[],
  sessions: CalendarSession[],
  projects: Map<number, Project>,
): string {
  const f = formatMessages();
  const out: string[] = [];
  for (const day of days) {
    const blocks = blocksOfDay(sessions, day).filter(counted);
    if (blocks.length === 0) continue;
    const byProject = Map.groupBy(blocks, (b) =>
      b.session.projectId !== null
        ? (projects.get(b.session.projectId)?.name ?? f.unknownProject)
        : f.unknownProject,
    );
    out.push(`## ${dateLabel(day)}`, "");
    for (const [name, list] of byProject) {
      out.push(`### ${name}`, "");
      for (const b of list) {
        const prs = b.segment.prs.map((a) => {
          const num = /\/pull\/(\d+)/.exec(a.ref)?.[1];
          return num ? `[#${num}](${a.ref})` : a.ref;
        });
        const time = `${hhmm(b.dayStart + b.start)}–${hhmm(b.segment.end)}`;
        const headline = b.segment.headline.replace(/\s+/g, " ").trim();
        out.push(`- ${time} ${headline}${prs.length ? ` (${prs.join(", ")})` : ""}`);
      }
      out.push("");
    }
  }
  return out.join("\n").trim();
}
