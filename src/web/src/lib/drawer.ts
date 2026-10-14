// Pure decisions behind the session drawer: which section is selected, which periods the flow
// shows, and how outcomes, subagents and summary failures are grouped. Kept free of React and
// messages so they can be tested on their own.
import type { Artifact, Section, SessionDetail, Subagent } from "@shared/api.ts";
import { ARTIFACT_GRACE_MS } from "@shared/constants.ts";
import type { SummaryParts } from "@shared/summaryBody.ts";
import { type OutcomeNode, outcomeNode } from "./artifacts.ts";
import { isSameDay } from "./dates.ts";

/** The section starting at `at`, falling back to the last one (also when `at` is null). */
export function selectedSection(sections: Section[], at: number | null): Section | null {
  return sections.find((x) => x.start === at) ?? sections.at(-1) ?? null;
}

/** Whether the sections span more than one calendar day, so each period needs a date. */
export function spansDays(sections: Section[]): boolean {
  return sections.some((x) => !isSameDay(x.start, sections[0]?.start ?? 0));
}

/** The periods the flow lists, and how many are left out on either side. */
export interface FlowWindow {
  shown: Section[];
  hiddenBefore: number;
  hiddenAfter: number;
}

/**
 * Up to `limit` periods centred on the selected one (or all of them when `expanded`), clamped so
 * the window never runs past either end. With no selection, centres on the last period.
 */
export function flowWindow(
  sections: Section[],
  selected: Section | null,
  limit: number,
  expanded: boolean,
): FlowWindow {
  if (expanded || sections.length <= limit) {
    return { shown: sections, hiddenBefore: 0, hiddenAfter: 0 };
  }
  const current = selected ? sections.indexOf(selected) : sections.length - 1;
  const from = Math.max(0, Math.min(current - Math.floor(limit / 2), sections.length - limit));
  const shown = sections.slice(from, from + limit);
  return { shown, hiddenBefore: from, hiddenAfter: sections.length - from - shown.length };
}

/**
 * Whether an outcome belongs to the section. A commit or PR often lands just after the last
 * message, so the end gets a grace period.
 */
export function inSection(a: Artifact, section: Section): boolean {
  return a.ts !== null && a.ts >= section.start && a.ts <= section.end + ARTIFACT_GRACE_MS;
}

/**
 * The session's PRs and commits in the order they were made (undated ones last), split into those
 * from the section and the rest. Time order, because the drawer draws them as nodes on one line.
 */
export function splitOutcomes(
  prs: Artifact[],
  commits: Artifact[],
  section: Section,
): { here: Artifact[]; rest: Artifact[] } {
  const at = (a: Artifact) => a.ts ?? Number.POSITIVE_INFINITY;
  // PRs first among equal times (the stable sort keeps them ahead of commits)
  const all = [...prs, ...commits].sort((a, b) => (at(a) === at(b) ? 0 : at(a) - at(b)));
  return {
    here: all.filter((a) => inSection(a, section)),
    rest: all.filter((a) => !inSection(a, section)),
  };
}

/** Whether a subagent ran at some point during the section. Without a selection, none did. */
export function ranDuring(a: Subagent, section: Section | null): boolean {
  return (
    section !== null &&
    a.startedAt !== null &&
    a.endedAt !== null &&
    a.startedAt <= section.end &&
    a.endedAt >= section.start
  );
}

/** Subagents split into those that ran during the section and the others, keeping their order. */
export function splitSubagents(
  subagents: Subagent[],
  section: Section | null,
): { here: Subagent[]; others: Subagent[] } {
  return {
    here: subagents.filter((a) => ranDuring(a, section)),
    others: subagents.filter((a) => !ranDuring(a, section)),
  };
}

/**
 * The node beside a structured summary's outcome: what the outcome (or, in the newer format, the
 * Resolved points) names among the PRs and commits made during the section.
 */
export function summaryOutcomeNode(
  parts: SummaryParts,
  session: Pick<SessionDetail, "prs" | "commits">,
  section: Section,
): OutcomeNode {
  const outcome = parts.outcome ?? parts.resolved.join("\n");
  return outcomeNode(outcome, splitOutcomes(session.prs, session.commits, section).here);
}
