import type { Database } from "bun:sqlite";
import { storedSummaryLang } from "../settings.ts";
import { FailureLog } from "./failures.ts";
import {
  buildPrompt,
  buildTitlePrompt,
  DEFAULT_SUMMARY_LANG,
  parseSummary,
  type SummaryLang,
} from "./prompt.ts";
import {
  buildRecapPrompt,
  loadRecapInput,
  parseRecap,
  type RecapTarget,
  recapKey,
} from "./recap.ts";
import {
  findAutoTargets,
  loadSectionInput,
  type Mode,
  type SectionRef,
  saveRecap,
  saveSummary,
  type Target,
} from "./store.ts";

/** Model used for summaries unless `--summary-model` is given; cheap suffices for excerpts. */
export const DEFAULT_MODEL = "haiku";
/** How often the idle loop looks for new automatic targets without being poked. */
const POLL_MS = 60_000;
/** More than a week of projects; past it, a request is refused rather than queued behind the rest. */
export const MAX_RECAP_QUEUE = 20;

/** Failure message for a section with no conversation in it; retrying can't help. */
export const NO_CONVERSATION = "No conversation to summarize";

/** Answers a prompt with the LLM. Production uses `runClaude`; tests pass a stub. */
export type Runner = (prompt: string) => Promise<string>;

/** String key for a section, for queue and failure lookups. */
const key = (t: SectionRef) => `${t.sessionId}:${t.start}`;

/**
 * Summarizes finished sections one at a time. Short sections get only a headline.
 * Only recent sections are summarized automatically; older ones are done when asked via `request`.
 */
export class Summarizer {
  private readonly queue: Target[] = [];
  private readonly failures = new FailureLog();
  private current: string | null = null;
  /** Recaps are only ever requested, so they need no retry schedule: a failure waits for the next request. */
  private readonly recaps: RecapTarget[] = [];
  private readonly recapErrors = new Map<string, string>();
  private currentRecap: string | null = null;
  private running = false;
  private wake: (() => void) | null = null;

  constructor(
    private readonly db: Database,
    private readonly run: Runner,
    private readonly opts: {
      model?: string;
      now?: () => number;
      onUpdated?: (target: SectionRef) => void;
      onRecapUpdated?: (target: RecapTarget) => void;
      /** When false, nothing is summarized automatically; only requested sections are. */
      auto?: boolean;
      /**
       * Language the summaries are written in, when fixed with `--summary-lang`. Without it, the
       * language chosen in the UI (stored in the DB) is used, falling back to English.
       */
      lang?: SummaryLang;
      /** Don't log failures to stderr; `kairos summarize` shows them in its own progress lines. */
      quiet?: boolean;
    } = {},
  ) {}

  /** Model recorded with each summary and recap it writes. */
  get model(): string {
    return this.opts.model ?? DEFAULT_MODEL;
  }

  /** Read on every run, so a language switched in the UI applies to the next summary. */
  get lang(): SummaryLang {
    return this.opts.lang ?? storedSummaryLang(this.db) ?? DEFAULT_SUMMARY_LANG;
  }

  /** Whether it summarizes recent sections on its own (off with `--no-auto-summary`). */
  get auto(): boolean {
    return this.opts.auto !== false;
  }

  /** The language was fixed with `--summary-lang`, so the UI's choice doesn't apply. */
  get langFixed(): boolean {
    return this.opts.lang !== undefined;
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  /** Whether the section is queued or being summarized now. */
  isPending(sessionId: string, start: number): boolean {
    const k = key({ sessionId, start });
    return this.current === k || this.queue.some((t) => key(t) === k);
  }

  /** Message of the section's last failed attempt; null once it succeeds or is requested again. */
  errorOf(sessionId: string, start: number): string | null {
    return this.failures.messageOf(key({ sessionId, start }));
  }

  /** Summarizes this section ahead of others (including regenerating). A request writes a body even for a short section. */
  request(sessionId: string, start: number): void {
    const target: Target = { sessionId, start, mode: "summary" };
    this.failures.clear(key(target));
    if (!this.isPending(sessionId, start)) this.queue.unshift(target);
    this.poke();
  }

  /** Whether the recap is queued or being written now. */
  isRecapPending(t: RecapTarget): boolean {
    const k = recapKey(t);
    return this.currentRecap === k || this.recaps.some((r) => recapKey(r) === k);
  }

  /** Message of the recap's latest failed attempt; null once it succeeds or is requested again. */
  recapErrorOf(t: RecapTarget): string | null {
    return this.recapErrors.get(recapKey(t)) ?? null;
  }

  /**
   * Writes (or rewrites) a project's recap for the period, after any requested section summaries.
   * Returns false when the queue is full.
   */
  requestRecap(t: RecapTarget): boolean {
    if (this.isRecapPending(t)) return true;
    if (this.recaps.length >= MAX_RECAP_QUEUE) return false;
    this.recapErrors.delete(recapKey(t));
    this.recaps.push(t);
    this.poke();
    return true;
  }

  /** Called when ingest updated sessions; there may be new sections to summarize. */
  poke(): void {
    this.wake?.();
  }

  /** Starts the background loop. Calling it again while running does nothing. */
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  /** Stops the loop after the current run; queued work is kept but not processed. */
  stop(): void {
    this.running = false;
    this.poke();
  }

  /** The next section to summarize: requested ones first, then automatic targets (newest first). */
  next(): Target | null {
    const requested = this.queue.shift();
    if (requested) return requested;
    if (this.opts.auto === false) return null;
    const now = this.now();
    return findAutoTargets(this.db, now).find((t) => !this.failures.isBlocked(key(t), now)) ?? null;
  }

  /** Runs one job at a time until stopped, idling when there is nothing to do. */
  private async loop(): Promise<void> {
    while (this.running) {
      // A requested section summary goes first: someone is waiting on it in the drawer, and a recap
      // written after it can use it. Recaps go before automatic summaries for the same reason
      const requested = this.queue.length === 0 ? this.recaps.shift() : undefined;
      if (requested) {
        await this.recap(requested);
        continue;
      }
      const target = this.next();
      if (target) await this.summarize(target);
      else await this.idle();
    }
  }

  /** Waits until poked or until the next poll, whichever comes first. */
  private async idle(): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, POLL_MS);
      this.wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    this.wake = null;
  }

  /** Summarizes and saves one section (`mode` defaults to a full summary). Failures are recorded and retried later. */
  async summarize(target: Omit<Target, "mode"> & { mode?: Mode }): Promise<boolean> {
    const k = key(target);
    this.current = k;
    try {
      const input = loadSectionInput(this.db, target);
      if (!input) {
        // No conversation (e.g. only scheduled runs). Retrying gives the same result, so skip it for good
        this.failures.giveUp(k, NO_CONVERSATION);
        return false;
      }
      const build = target.mode === "title" ? buildTitlePrompt : buildPrompt;
      const parsed = parseSummary(await this.run(build(input.prompt, this.lang)));
      if (!parsed) throw new Error("Could not parse the summary output");
      // Headline-only: keep the body empty, discarding any extra lines after the headline
      const body = target.mode === "title" ? "" : parsed.body;
      saveSummary(
        this.db,
        target,
        { headline: parsed.headline, body },
        { model: this.model, coveredUntil: input.end, createdAt: this.now() },
      );
      this.failures.clear(k);
      return true;
    } catch (e) {
      const attempts = this.failures.record(k, e, this.now());
      if (!this.opts.quiet)
        console.error(`kairos: summary failed for ${k} (attempt ${attempts}):`, e);
      return false;
    } finally {
      this.current = null;
      this.opts.onUpdated?.(target);
    }
  }

  /** Writes and saves one recap. A failure is kept to show in the summary view until the next request. */
  async recap(t: RecapTarget): Promise<boolean> {
    const k = recapKey(t);
    this.currentRecap = k;
    try {
      const input = loadRecapInput(this.db, t);
      if (!input) throw new Error("No work to recap in this period");
      const body = parseRecap(await this.run(buildRecapPrompt(input, this.lang)));
      if (!body) throw new Error("The recap came back empty");
      saveRecap(this.db, t, input, body, { model: this.model, createdAt: this.now() });
      this.recapErrors.delete(k);
      return true;
    } catch (e) {
      this.recapErrors.set(k, e instanceof Error ? e.message : String(e));
      console.error(`kairos: recap failed for ${k}:`, e);
      return false;
    } finally {
      this.currentRecap = null;
      this.opts.onRecapUpdated?.(t);
    }
  }
}
