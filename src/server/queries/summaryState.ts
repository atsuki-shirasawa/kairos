import type { RecapTarget } from "../summarize/recap.ts";

/**
 * Summary progress that the read queries report alongside stored summaries. Implemented by
 * the Summarizer; without one, nothing is ever pending or failed.
 */
export interface SummaryState {
  isPending(sessionId: string, start: number): boolean;
  errorOf(sessionId: string, start: number): string | null;
  isRecapPending(target: RecapTarget): boolean;
  recapErrorOf(target: RecapTarget): string | null;
}

/** The summary state when summaries are off: nothing is pending and nothing failed. */
export const NO_SUMMARIES: SummaryState = {
  isPending: () => false,
  errorOf: () => null,
  isRecapPending: () => false,
  recapErrorOf: () => null,
};
