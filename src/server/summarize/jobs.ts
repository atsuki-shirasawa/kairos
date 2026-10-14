// The state the summarizer keeps per kind of job (section summaries, recaps): what is queued, what
// is running, and how each job's last attempt failed.
import { FailureLog } from "./failures.ts";

/**
 * A queue of jobs of one kind, the one running now, and their failures, all by a string key.
 * `K` is what identifies a job (a section without its mode, say); `T` is what is queued.
 */
export class JobTracker<T extends K, K = T> {
  /** Failed attempts by key; a success or a new request clears a job's entry. */
  private readonly failures = new FailureLog();
  private readonly queue: T[] = [];
  private running: string | null = null;

  /** `keyOf` names a job, so a job queued twice or queued while it runs is recognized. */
  constructor(readonly keyOf: (job: K) => string) {}

  /** How many jobs are queued, not counting the one running. */
  get length(): number {
    return this.queue.length;
  }

  /** Whether the job is queued or running now. */
  isPending(job: K): boolean {
    const k = this.keyOf(job);
    return this.running === k || this.queue.some((j) => this.keyOf(j) === k);
  }

  /** Message of the job's latest failed attempt; null once it succeeds or is requested again. */
  errorOf(job: K): string | null {
    return this.failures.messageOf(this.keyOf(job));
  }

  /** Counts a failed attempt and schedules its automatic retry. Returns the attempt count so far. */
  recordFailure(job: K, error: unknown, now: number): number {
    return this.failures.record(this.keyOf(job), error, now);
  }

  /** Records a failure that a retry would repeat, so automatic runs skip the job for good. */
  giveUp(job: K, message: string): void {
    this.failures.giveUp(this.keyOf(job), message);
  }

  /** Forgets the job's failures, after a success or an explicit request. */
  clearFailure(job: K): void {
    this.failures.clear(this.keyOf(job));
  }

  /** Whether an automatic run should skip the job: out of attempts or still backing off. */
  isBlocked(job: K, now: number): boolean {
    return this.failures.isBlocked(this.keyOf(job), now);
  }

  /** Queues the job ahead of the others. */
  pushFront(job: T): void {
    this.queue.unshift(job);
  }

  /** Queues the job after the others. */
  pushBack(job: T): void {
    this.queue.push(job);
  }

  /** Takes the next queued job, if any. */
  take(): T | undefined {
    return this.queue.shift();
  }

  /** Runs `work` with the job marked as running, so it counts as pending until `work` settles. */
  async track<R>(job: K, work: () => Promise<R>): Promise<R> {
    this.running = this.keyOf(job);
    try {
      return await work();
    } finally {
      this.running = null;
    }
  }
}
