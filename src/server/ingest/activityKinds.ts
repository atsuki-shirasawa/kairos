// Which activity rows are requests: what the work blocks count and the topic turns start on.
import type { ActivityRow } from "./statements.ts";

/** Message kinds the user sent: a prompt or a slash command. */
export const PROMPT_KINDS: readonly string[] = ["prompt", "command"];

/** Whether a row is something the user asked for (a prompt or a slash command). */
export function isPrompt(r: ActivityRow): boolean {
  return PROMPT_KINDS.includes(r.kind);
}

/**
 * Whether a row asks for work: a prompt or command, the input of a headless (SDK) session, or an
 * automatic run's tick (`/loop`, a scheduled task).
 */
export function isRequest(r: ActivityRow): boolean {
  return isPrompt(r) || r.kind === "sdk_prompt" || r.kind === "scheduled";
}
