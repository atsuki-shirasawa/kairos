/** Automatic runs give up on a section after this many failed attempts; a request still retries it. */
const MAX_ATTEMPTS = 3;
/** Wait before the first retry; it doubles with each further failure. */
const RETRY_BASE_MS = 60_000;

interface Failure {
  attempts: number;
  retryAt: number;
  message: string;
}

/** Failed section summaries by key, with exponential backoff before an automatic retry. */
export class FailureLog {
  private readonly failures = new Map<string, Failure>();

  /** Counts a failed attempt and schedules the next retry. Returns the attempt count so far. */
  record(key: string, error: unknown, now: number): number {
    const attempts = (this.failures.get(key)?.attempts ?? 0) + 1;
    this.failures.set(key, {
      attempts,
      retryAt: now + RETRY_BASE_MS * 2 ** (attempts - 1),
      message: error instanceof Error ? error.message : String(error),
    });
    return attempts;
  }

  /** Marks the key as never to be retried automatically, for failures a retry would repeat. */
  giveUp(key: string, message: string): void {
    this.failures.set(key, {
      attempts: MAX_ATTEMPTS,
      retryAt: Number.POSITIVE_INFINITY,
      message,
    });
  }

  /** Forgets the key's failures, after a success or an explicit request. */
  clear(key: string): void {
    this.failures.delete(key);
  }

  /** Message of the key's latest failure, or null when it has none. */
  messageOf(key: string): string | null {
    return this.failures.get(key)?.message ?? null;
  }

  /** Whether an automatic run should skip the key: out of attempts or still backing off. */
  isBlocked(key: string, now: number): boolean {
    const f = this.failures.get(key);
    return f !== undefined && (f.attempts >= MAX_ATTEMPTS || f.retryAt > now);
  }
}
