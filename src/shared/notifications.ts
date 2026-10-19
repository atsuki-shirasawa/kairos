// Reading a `<task-notification>` that Claude Code writes when a background task or subagent
// finishes. The drawer shows its summary, and the summarizer quotes its result.

/** A notification's `<summary>` ("Agent "Review" finished"), or null when it has none. */
export function notificationSummary(text: string): string | null {
  return /<summary>([\s\S]*?)<\/summary>/.exec(text)?.[1]?.trim() || null;
}

/**
 * A notification's `<result>`, what the task reported, or null when it has none. Stored text can
 * be cut short, so a `<result>` with no end runs to the end of the text.
 */
export function notificationResult(text: string): string | null {
  return /<result>([\s\S]*?)(?:<\/result>|$)/.exec(text)?.[1]?.trim() || null;
}
