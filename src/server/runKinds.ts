// What a headless session is and what kind of run it is, shared by ingest (which classifies runs),
// the visibility rule and the summarizer. The rule that decides a run's kind is in
// `ingest/runKinds.ts`.

/** The run kinds stored in `sessions.run_kind`, by name, for building SQL from. */
export const RUN_KINDS = { automation: "automation", trial: "trial" } as const;

/**
 * `automation` is work a script does for you, shown like your own; `trial` is a probe or a check,
 * shown only when asked for.
 */
export type RunKind = (typeof RUN_KINDS)[keyof typeof RUN_KINDS];

/** A session's prompt counts, as `isHeadless` reads them. */
export interface PromptCounts {
  prompt_count: number;
  sdk_prompt_count: number;
}

/**
 * Whether a session is headless: no human prompt, and at least one request given through the SDK
 * (`claude -p`). A session with neither was closed before its first prompt. Same rule as
 * `headlessSql`.
 */
export function isHeadless(s: PromptCounts): boolean {
  return s.prompt_count === 0 && s.sdk_prompt_count > 0;
}

/** SQL condition on the sessions table aliased `alias` for a headless session (see `isHeadless`). */
export function headlessSql(alias = "s"): string {
  return `(${alias}.prompt_count = 0 AND ${alias}.sdk_prompt_count > 0)`;
}

/** SQL condition on the sessions table aliased `alias` for an automation run. */
export function automationSql(alias = "s"): string {
  return `${alias}.run_kind = '${RUN_KINDS.automation}'`;
}
