// Why a summary failed. The server stores the error text, and the UI classifies it to suggest the
// next step, so the server's own messages are defined next to the classifier that reads them.

/** Stored when there is no `claude` on the PATH. */
export const CLAUDE_NOT_FOUND = "claude command not found";

/** Stored when `claude -p` was stopped for running too long. */
export function timedOutMessage(seconds: number): string {
  return `Did not finish within ${seconds} seconds`;
}

/** Why a summary failed, as far as the next step for the user goes. */
export type SummaryFailureKind = "login" | "noClaude" | "timeout" | "rateLimit" | "other";

/**
 * Classifies a stored failure: the server's own messages above, or the error output of
 * `claude -p` itself (login, rate limits).
 */
export function summaryFailureKind(error: string): SummaryFailureKind {
  if (/not logged in|log ?in|authenticat/i.test(error)) return "login";
  if (error.toLowerCase().includes(CLAUDE_NOT_FOUND)) return "noClaude";
  if (/did not finish within|timed out/i.test(error)) return "timeout";
  if (/rate.?limit|usage limit|overloaded|\b(429|529)\b/i.test(error)) return "rateLimit";
  return "other";
}
