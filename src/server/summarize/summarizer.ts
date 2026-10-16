import type { Database } from "bun:sqlite";
import { MINUTE } from "../../shared/dates.ts";
import { DEFAULT_SUMMARY_LANG, type SummaryLang } from "../../shared/summaryLang.ts";
import { storedSummaryLang } from "../settings.ts";
import type { Runner } from "./claude.ts";
import { JobTracker } from "./jobs.ts";
import { loadRecapInput, type RecapTarget, recapKey } from "./recap.ts";
import { buildRecapPrompt, parseRecap } from "./recapPrompt.ts";
import { answerSection, interpretSection, prepareSection } from "./section.ts";
import { findAutoTargets, saveRecap, saveSection } from "./store.ts";
import type { Mode, SectionRef, Target } from "./target.ts";

/** Model used for summaries unless `--summary-model` is given; cheap suffices for excerpts. */
export const DEFAULT_MODEL = "haiku";
/** How often the idle loop looks for new automatic targets without being poked. */
const POLL_MS = MINUTE;
/** More than a week of projects; past it, a request is refused rather than queued behind the rest. */
export const MAX_RECAP_QUEUE = 20;

/** Failure message for a section with no conversation in it; retrying can't help. */
export const NO_CONVERSATION = "No conversation to summarize";
/** Why a summary was dropped: the block moved while the model ran, so it is due at its new start. */
export const BLOCK_MOVED = "The block moved while it was summarized";

/**
 * How summarizing one section went: saved, skipped for good (nothing to summarize), or failed
 * (to be retried). `error` is the message also kept for `errorOf`.
 */
export type SummarizeResult =
  | { status: "saved" }
  | { status: "skipped"; error: string }
  | { status: "failed"; error: string };

/** String key for a section, for queue and failure lookups. */
const key = (t: SectionRef) => `${t.sessionId}:${t.start}`;

/** A job for the loop: a section to summarize or a recap to write. */
export type Job = { kind: "section"; target: Target } | { kind: "recap"; target: RecapTarget };

/**
 * Summarizes finished sections one at a time. Short sections get only a headline.
 * Only recent sections are summarized automatically; older ones are done when asked via `request`.
 */
export class Summarizer {
  /** Requested sections; automatic ones are found when the queue is empty. */
  private readonly sections = new JobTracker<Target, SectionRef>(key);
  /**
   * Recaps are only ever requested, so nothing reads their failures' retry schedule (only the
   * message, for `recapErrorOf`): a failure waits for the next request.
   */
  private readonly recaps = new JobTracker<RecapTarget>(recapKey);
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
    return this.sections.isPending({ sessionId, start });
  }

  /** Message of the section's last failed attempt; null once it succeeds or is requested again. */
  errorOf(sessionId: string, start: number): string | null {
    return this.sections.errorOf({ sessionId, start });
  }

  /** Summarizes this section ahead of others (including regenerating). A request writes a body even for a short section. */
  request(sessionId: string, start: number): void {
    const target: Target = { sessionId, start, mode: "summary" };
    this.sections.clearFailure(target);
    if (!this.isPending(sessionId, start)) this.sections.pushFront(target);
    this.poke();
  }

  /** Whether the recap is queued or being written now. */
  isRecapPending(t: RecapTarget): boolean {
    return this.recaps.isPending(t);
  }

  /** Message of the recap's latest failed attempt; null once it succeeds or is requested again. */
  recapErrorOf(t: RecapTarget): string | null {
    return this.recaps.errorOf(t);
  }

  /**
   * Writes (or rewrites) a project's recap for the period, after any requested section summaries.
   * Returns false when the queue is full.
   */
  requestRecap(t: RecapTarget): boolean {
    if (this.isRecapPending(t)) return true;
    if (this.recaps.length >= MAX_RECAP_QUEUE) return false;
    this.recaps.clearFailure(t);
    this.recaps.pushBack(t);
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

  /** The newest automatic target not waiting on a retry, or null when automatic runs are off. */
  private nextAuto(): Target | null {
    if (this.opts.auto === false) return null;
    const now = this.now();
    return findAutoTargets(this.db, now).find((t) => !this.sections.isBlocked(t, now)) ?? null;
  }

  /**
   * The next job of either kind. A requested section summary goes first: someone is waiting on it
   * in the drawer, and a recap written after it can use it. Recaps go before automatic summaries
   * for the same reason. Automatic targets come newest first. The loop runs what this returns.
   */
  nextJob(): Job | null {
    const requested = this.sections.take();
    if (requested) return { kind: "section", target: requested };
    const recap = this.recaps.take();
    if (recap) return { kind: "recap", target: recap };
    const auto = this.nextAuto();
    return auto ? { kind: "section", target: auto } : null;
  }

  /** Runs one job at a time until stopped, idling when there is nothing to do. */
  private async loop(): Promise<void> {
    while (this.running) {
      const job = this.nextJob();
      if (!job) await this.idle();
      else if (job.kind === "recap") await this.recap(job.target);
      else await this.summarize(job.target);
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

  /**
   * Summarizes and saves one section (`mode` defaults to a full summary). A section with nothing
   * to summarize is skipped for good; other failures are recorded and retried later.
   */
  async summarize(target: Omit<Target, "mode"> & { mode?: Mode }): Promise<SummarizeResult> {
    try {
      return await this.sections.track(target, () =>
        this.summarizeSection({ ...target, mode: target.mode ?? "summary" }),
      );
    } finally {
      this.opts.onUpdated?.(target);
    }
  }

  /** Runs the model on one section and saves the result, recording a failure for `errorOf`. */
  private async summarizeSection(target: Target): Promise<SummarizeResult> {
    try {
      const prepared = prepareSection(this.db, target, this.lang);
      if (prepared === "no-conversation") {
        // Retrying gives the same result, so skip it for good
        this.sections.giveUp(target, NO_CONVERSATION);
        return { status: "skipped", error: NO_CONVERSATION };
      }
      const result = interpretSection(await answerSection(this.run, prepared), prepared);
      const saved = saveSection(this.db, target, result, {
        model: this.model,
        createdAt: this.now(),
      });
      // Not "skipped", which means nothing to summarize: the work was there, but has moved
      if (!saved) return { status: "failed", error: BLOCK_MOVED };
      this.sections.clearFailure(target);
      return { status: "saved" };
    } catch (e) {
      const attempts = this.sections.recordFailure(target, e, this.now());
      // Unlike recaps, section failures honour `quiet`: `kairos summarize` prints its own lines
      if (!this.opts.quiet)
        console.error(`kairos: summary failed for ${key(target)} (attempt ${attempts}):`, e);
      return { status: "failed", error: this.sections.errorOf(target) ?? String(e) };
    }
  }

  /** Writes and saves one recap. A failure is kept to show in the summary view until the next request. */
  async recap(t: RecapTarget): Promise<boolean> {
    try {
      return await this.recaps.track(t, () => this.writeRecap(t));
    } finally {
      this.opts.onRecapUpdated?.(t);
    }
  }

  /** Runs the model on one recap and saves it, recording a failure for `recapErrorOf`. */
  private async writeRecap(t: RecapTarget): Promise<boolean> {
    try {
      const input = loadRecapInput(this.db, t);
      if (!input) throw new Error("No work to recap in this period");
      const body = parseRecap(await this.run(buildRecapPrompt(input, this.lang)));
      if (!body) throw new Error("The recap came back empty");
      saveRecap(this.db, t, input, body, { model: this.model, createdAt: this.now() });
      this.recaps.clearFailure(t);
      return true;
    } catch (e) {
      this.recaps.recordFailure(t, e, this.now());
      console.error(`kairos: recap failed for ${recapKey(t)}:`, e);
      return false;
    }
  }
}
