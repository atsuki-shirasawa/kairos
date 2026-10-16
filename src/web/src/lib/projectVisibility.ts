// Which sessions are kept off screen before any filtering: those in hidden projects (saved in the
// DB) and, when asked, quick questions. Unlike the filter's conditions, these remove sessions
// rather than narrowing their blocks.
import type { CalendarSession, Project } from "@shared/api.ts";
import { isProjectShown } from "@shared/projects.ts";
import { type Filter, NO_FILTER } from "./filter.ts";

/** Sessions with at most this many prompts and no hands-on work count as "quick questions". */
export const BRIEF_PROMPTS = 2;

/**
 * Sessions with few prompts and no file edits, commits or PRs.
 * A single request that delegated a large task still has edits, so it stays.
 */
export function isBrief(session: CalendarSession): boolean {
  if (session.promptCount > BRIEF_PROMPTS) return false;
  return session.segments.every(
    (g) => g.activity.filesEdited === 0 && g.activity.commits === 0 && g.activity.prs === 0,
  );
}

/** Drops sessions kept off screen (hidden projects, and quick questions when hidden). */
export function hideSessions(
  sessions: CalendarSession[],
  projects: Map<number, Project>,
  filter: Filter,
): CalendarSession[] {
  const shown = inShownProjects(sessions, projects);
  return filter.hideBrief ? shown.filter((s) => !isBrief(s)) : shown;
}

/**
 * Sessions outside hidden projects, quick questions included: what the filter's conditions count,
 * since hiding quick questions is one of those conditions.
 */
export function inShownProjects(
  sessions: CalendarSession[],
  projects: Map<number, Project>,
): CalendarSession[] {
  return sessions.filter((s) => isProjectShown(projects, s.projectId));
}

/**
 * Why a period with sessions shows none of them: every one is in a hidden project, or the rest
 * are quick questions being hidden. null when there are no sessions at all.
 */
export function hiddenReason(
  sessions: CalendarSession[],
  projects: Map<number, Project>,
): "project" | "brief" | null {
  if (sessions.length === 0) return null;
  return hideSessions(sessions, projects, NO_FILTER).length === 0 ? "project" : "brief";
}
