// What the summarizer works on: a section, and how to summarize it. Kept apart from the DB code so
// the store, the ledger and the queue can all name a section without importing one another.
import { isSummarizable } from "../../shared/sections.ts";
import { RUN_KINDS, type RunKind } from "../runKinds.ts";

/**
 * `summary` writes a headline and a body; `title` writes only a headline.
 * Short sections have too little in them for a body, so automatic runs give them only a headline.
 */
export type Mode = "summary" | "title";

/**
 * Least tool calls for an automation run's section to get a full summary. A headless run has no
 * prompts to count, and its time is mostly spent waiting on subagents; on real loops an iteration
 * that implemented an issue made 9 to 38 calls, a run that only opened its PR 4 to 7.
 */
export const RUN_SUMMARY_MIN_TOOLS = 8;

/** What deciding a section's mode looks at. */
export interface SectionSize {
  start: number;
  end: number;
  promptCount: number;
  /** Tool calls of the main conversation in the section. */
  toolCalls: number;
  /** The session's run kind (`sessions.run_kind`), null for a person's. */
  runKind: RunKind | null;
}

/**
 * How an automatic summary treats a section: a person's work by its length and prompts
 * (`isSummarizable`); an automation run by the work it did, since it has no prompts; a trial run
 * (a probe or a check) only ever gets a headline.
 */
export function modeOf(section: SectionSize): Mode {
  if (section.runKind === RUN_KINDS.trial) return "title";
  if (section.runKind === RUN_KINDS.automation)
    return section.toolCalls >= RUN_SUMMARY_MIN_TOOLS || isSummarizable(section)
      ? "summary"
      : "title";
  return isSummarizable(section) ? "summary" : "title";
}

/** A section (identified by session and start time) and how to summarize it. */
export interface Target {
  sessionId: string;
  start: number;
  mode: Mode;
}

/** A section, identified by its session and start time. */
export type SectionRef = Pick<Target, "sessionId" | "start">;
