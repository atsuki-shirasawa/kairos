// What `kairos open-items` and `search` print, built from the same data the API serves. The
// report is built and rendered in `shared/report.ts`, which the UI copies from too.
// Kept free of I/O so the output can be tested on plain objects.
import type { LedgerEntry, Project, SearchHit } from "../shared/api.ts";
import { isoDay, startOfDay } from "../shared/dates.ts";
import { NO_PROJECT_NAME, openItemLine } from "../shared/report.ts";
import { printable, printableLine } from "../shared/text.ts";
import { formatTime, uiLink } from "./format.ts";
import { styles } from "./style.ts";

/** A project's display name, or the placeholder for work outside any project. */
function projectName(projects: ReadonlyMap<number, Project>, id: number | null): string {
  return (id !== null ? projects.get(id)?.name : undefined) ?? NO_PROJECT_NAME;
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
    for (const i of list) out.push(`${openItemLine(i)} (left open ${isoDay(i.openedAt)})`);
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
    `${dim(formatTime(h.start))}  ${bold(printable(projectName(projects, h.projectId)))}  ${printableLine(h.headline)}`,
    ...(h.snippet ? [`  ${dim(`${h.field}:`)} ${printableLine(h.snippet)}`] : []),
    `  ${dim(uiLink(base, { day: startOfDay(h.start), session: h.sessionId, start: h.start }))}`,
    "",
  ]);
  if (more) out.push(dim("More sections matched; add terms or raise --limit."));
  return out.join("\n").trim();
}
