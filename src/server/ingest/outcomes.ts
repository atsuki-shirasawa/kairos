// What a tool call is expected to produce once its result arrives: a commit, a created PR or a
// merged PR. Only the result says whether it happened, so the call's part is remembered until then.
import { GIT_COMMIT_RE } from "./commits.ts";
import { LIMIT } from "./limits.ts";
import { GH_PR_CREATE_RE, prMergeOf, prTitleOf } from "./prs.ts";

/** Outcomes a tool call awaits, each with what the call itself says about it. */
export interface PendingOutcomes {
  /** A git commit: the command, kept to read the subject when the output lacks it. */
  commit?: string;
  /** A gh pr create: the PR's title, which its result doesn't repeat. */
  prTitle?: string;
  /** A gh pr merge: the PR number, null when the command doesn't name one. */
  merge?: { number: number | null };
}

/**
 * The outcomes a tool call named `name` running `command` awaits. Only Bash runs git and gh; a
 * pr create whose title is decided at run time awaits nothing, since its title can't be known.
 */
export function pendingOutcomes(name: string, command: string): PendingOutcomes {
  if (name !== "Bash") return {};
  const outcomes: PendingOutcomes = {};
  if (GIT_COMMIT_RE.test(command)) outcomes.commit = command.slice(0, LIMIT.short);
  const prTitle = GH_PR_CREATE_RE.test(command) && prTitleOf(command);
  if (prTitle) outcomes.prTitle = prTitle.slice(0, LIMIT.short);
  const merge = prMergeOf(command);
  if (merge) outcomes.merge = merge;
  return outcomes;
}
