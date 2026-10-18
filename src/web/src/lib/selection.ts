// Rules about a block that every view answers the same way: which project it belongs to, whether
// it is selected, whether it is still being worked on, and whether it is toned down.
import { formatMessages } from "@/i18n/messages/format.ts";
import type { DayBlock } from "./dayBlocks.ts";
import type { SegmentMatch } from "./filter.ts";

/** Opens a session's block in the drawer, by the session and the block's start. */
export type OpenBlock = (session: string, at: number) => void;

/** The project with `id`, if known. Sessions outside any project have no id. */
export function projectOf<P>(projects: ReadonlyMap<number, P>, id: number | null): P | undefined {
  return id !== null ? projects.get(id) : undefined;
}

/** A project's name, or the "unknown project" label for work outside any project. */
export function projectLabel(project: { name: string } | null | undefined): string {
  return project?.name ?? formatMessages().unknownProject;
}

/** The name of the project with `id`, or the "unknown project" label. */
export function projectName(
  projects: ReadonlyMap<number, { name: string }>,
  id: number | null,
): string {
  return projectLabel(projectOf(projects, id));
}

/**
 * Whether the section of `sessionId` starting at `start` is the selected one. With no section start
 * (`selectedAt` null), every section of the selected session counts as selected.
 */
export function isSelectedSection(
  section: { sessionId: string; start: number },
  selectedId: string | null,
  selectedAt: number | null,
): boolean {
  return section.sessionId === selectedId && (selectedAt === null || section.start === selectedAt);
}

/** Whether `block` is the selected section (see `isSelectedSection`). */
export function isSelected(
  block: DayBlock,
  selectedId: string | null,
  selectedAt: number | null,
): boolean {
  return isSelectedSection(
    { sessionId: block.session.id, start: block.segment.start },
    selectedId,
    selectedAt,
  );
}

/**
 * When a session's work ends so far: the latest end among its sections. Whether a section is the
 * one still being worked on is judged against it.
 */
export function sessionEnd(session: Pick<DayBlock["session"], "segments">): number {
  return Math.max(...session.segments.map((g) => g.end));
}

/** Whether `block` is the latest section of a session that is still running. */
export function isWorking(block: Pick<DayBlock, "session" | "segment">): boolean {
  const { session, segment } = block;
  return session.active && segment.end >= sessionEnd(session);
}

/**
 * Whether `block` is toned down. Before it is summarized its heading is only the raw first prompt
 * ("sorry, meant for another session", etc.), which is noise next to summarized work. Work still
 * in progress is only waiting for its summary, so it keeps the normal look. Every view (week, day,
 * month, marks, list) uses this rule.
 */
export function isDim(block: Pick<DayBlock, "session" | "segment">): boolean {
  return !block.segment.summarized && !isWorking(block);
}

/**
 * Whether this day's piece of the block holds its section's end. A section crossing midnight is
 * drawn on both days, and the in-progress dot goes only where the work is now: the later piece.
 */
export function reachesSegmentEnd(block: Pick<DayBlock, "dayStart" | "end" | "segment">): boolean {
  return block.dayStart + block.end >= block.segment.end;
}

/**
 * Whether this day's piece of `block` shows the work in progress: the latest section of a running
 * session, on the day that holds its end. The calendar card and the day page's row mark it alike.
 */
export function isWorkingHere(
  block: Pick<DayBlock, "session" | "segment" | "dayStart" | "end">,
): boolean {
  return isWorking(block) && reachesSegmentEnd(block);
}

/**
 * The block a group (a burst of headless runs drawn as one mark or row) opens and describes: its
 * first run that matches the filter, else its first. A single block is its own lead.
 */
export function groupLead<T extends Pick<DayBlock, "session" | "segment">>(
  runs: readonly T[],
  matches: SegmentMatch,
): T | undefined {
  return runs.find((r) => matches(r.session, r.segment)) ?? runs[0];
}

/** Whether any run of a group is the selected section (see `isSelected`). */
export function isGroupSelected(
  runs: readonly DayBlock[],
  selectedId: string | null,
  selectedAt: number | null,
): boolean {
  return runs.some((r) => isSelected(r, selectedId, selectedAt));
}

/** Whether any run of a group passes the keyword and the filter; otherwise the group fades. */
export function groupMatches(
  runs: readonly Pick<DayBlock, "session" | "segment">[],
  matches: SegmentMatch,
): boolean {
  return runs.some((r) => matches(r.session, r.segment));
}
