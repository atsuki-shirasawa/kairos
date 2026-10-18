// Which activity rows are requests: what the work blocks count and the topic turns start on.
import type { ActivityRow } from "./statements.ts";

/** Whether a row is something the user asked for (a prompt or a slash command). */
export function isPrompt(r: ActivityRow): boolean {
  return r.kind === "prompt" || r.kind === "command";
}

/**
 * Whether a row asks for work: a prompt or command, the input of a headless (SDK) session, or an
 * automatic run's tick (`/loop`, a scheduled task).
 */
export function isRequest(r: ActivityRow): boolean {
  return isPrompt(r) || r.kind === "sdk_prompt" || r.kind === "scheduled";
}
