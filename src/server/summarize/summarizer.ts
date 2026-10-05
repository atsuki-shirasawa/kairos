import type { Database } from "bun:sqlite";
import { AUTO_SUMMARY_DAYS, isSummarizable, SECTION_IDLE_MS } from "../../shared/sections.ts";
import { storedSummaryLang } from "../settings.ts";
import { buildDigest, type DigestMessage } from "./digest.ts";
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
  recapHash,
  recapKey,
} from "./recap.ts";

/** Model used for summaries unless `--summary-model` is given; cheap suffices for excerpts. */
export const DEFAULT_MODEL = "haiku";
const POLL_MS = 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 60_000;
/** More than a week of projects; past it, a request is refused rather than queued behind the rest. */
export const MAX_RECAP_QUEUE = 20;

/** Answers a prompt with the LLM. Production uses `runClaude`; tests pass a stub. */
export type Runner = (prompt: string) => Promise<string>;

/**
 * `summary` writes a headline and a body; `title` writes only a headline.
 * Short sections have too little in them for a body, so automatic runs give them only a headline.
 */
type Mode = "summary" | "title";

interface Target {
  sessionId: string;
  start: number;
  mode: Mode;
}

interface Failure {
  attempts: number;
  retryAt: number;
  message: string;
}

const key = (t: Pick<Target, "sessionId" | "start">) => `${t.sessionId}:${t.start}`;

/**
 * Summarizes finished sections one at a time. Short sections get only a headline.
 * Only recent sections are summarized automatically; older ones are done when asked via `request`.
 */
export class Summarizer {
  private readonly queue: Target[] = [];
  private readonly failures = new Map<string, Failure>();
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
      onUpdated?: (target: Pick<Target, "sessionId" | "start">) => void;
      onRecapUpdated?: (target: RecapTarget) => void;
      /** When false, nothing is summarized automatically; only requested sections are. */
      auto?: boolean;
      /**
       * Language the summaries are written in, when fixed with `--summary-lang`. Without it, the
       * language chosen in the UI (stored in the DB) is used, falling back to English.
       */
      lang?: SummaryLang;
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
    return this.failures.get(key({ sessionId, start }))?.message ?? null;
  }

  /** Summarizes this section ahead of others (including regenerating). A request writes a body even for a short section. */
  request(sessionId: string, start: number): void {
    const target: Target = { sessionId, start, mode: "summary" };
    this.failures.delete(key(target));
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
    const rows = this.db
      .query<
        { session_id: string; start: number; end: number; prompt_count: number },
        [number, number, number]
      >(
        `SELECT g.session_id, g.start, g.end, g.prompt_count
         FROM segments g
         JOIN sessions s ON s.id = g.session_id
         LEFT JOIN summaries sm ON sm.session_id = g.session_id AND sm.start = g.start
         WHERE s.prompt_count > 0
           AND g.end >= ?1
           AND (g.end <= ?2 OR EXISTS (SELECT 1 FROM segments later WHERE later.session_id = g.session_id AND later.start > g.start))
           AND (sm.session_id IS NULL OR sm.covered_until < g.end)
         ORDER BY g.end DESC
         LIMIT ?3`,
      )
      .all(now - AUTO_SUMMARY_DAYS * 24 * 60 * 60_000, now - SECTION_IDLE_MS, 50);
    for (const r of rows) {
      const long = isSummarizable({ start: r.start, end: r.end, promptCount: r.prompt_count });
      const t: Target = {
        sessionId: r.session_id,
        start: r.start,
        mode: long ? "summary" : "title",
      };
      const f = this.failures.get(key(t));
      if (f && (f.attempts >= MAX_ATTEMPTS || f.retryAt > now)) continue;
      return t;
    }
    return null;
  }

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
      if (!target) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, POLL_MS);
          this.wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        this.wake = null;
        continue;
      }
      await this.summarize(target);
    }
  }

  /** Summarizes and saves one section (`mode` defaults to a full summary). Failures are recorded and retried later. */
  async summarize(target: Omit<Target, "mode"> & { mode?: Mode }): Promise<boolean> {
    const k = key(target);
    this.current = k;
    try {
      const input = this.load(target);
      if (!input) {
        // No conversation (e.g. only scheduled runs). Retrying gives the same result, so skip it for good
        this.failures.set(k, {
          attempts: MAX_ATTEMPTS,
          retryAt: Number.POSITIVE_INFINITY,
          message: "No conversation to summarize",
        });
        return false;
      }
      const build = target.mode === "title" ? buildTitlePrompt : buildPrompt;
      const parsed = parseSummary(await this.run(build(input.prompt, this.lang)));
      if (!parsed) throw new Error("Could not parse the summary output");
      // Headline-only: keep the body empty, discarding any extra lines after the headline
      const body = target.mode === "title" ? "" : parsed.body;
      this.db
        .query(
          `INSERT INTO summaries (session_id, start, headline, body, model, covered_until, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(session_id, start) DO UPDATE SET headline = excluded.headline, body = excluded.body,
             model = excluded.model, covered_until = excluded.covered_until, created_at = excluded.created_at`,
        )
        .run(
          target.sessionId,
          target.start,
          parsed.headline,
          body,
          this.model,
          input.end,
          this.now(),
        );
      this.failures.delete(k);
      return true;
    } catch (e) {
      const prev = this.failures.get(k);
      const attempts = (prev?.attempts ?? 0) + 1;
      this.failures.set(k, {
        attempts,
        retryAt: this.now() + RETRY_BASE_MS * 2 ** (attempts - 1),
        message: e instanceof Error ? e.message : String(e),
      });
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
      this.db
        .query(
          `INSERT INTO recaps (project_id, period_from, period_to, body, model, input_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(project_id, period_from, period_to) DO UPDATE SET body = excluded.body,
             model = excluded.model, input_hash = excluded.input_hash, created_at = excluded.created_at`,
        )
        .run(t.projectId, t.from, t.to, body, this.model, recapHash(input), this.now());
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

  private load(
    target: Pick<Target, "sessionId" | "start">,
  ): { end: number; prompt: Parameters<typeof buildPrompt>[0] } | null {
    const seg = this.db
      .query<{ end: number }, [string, number]>(
        "SELECT end FROM segments WHERE session_id = ? AND start = ?",
      )
      .get(target.sessionId, target.start);
    if (!seg) return null;
    const session = this.db
      .query<{ title: string | null; project: string | null }, [string]>(
        `SELECT COALESCE(s.custom_title, s.agent_name, s.ai_title, substr(s.first_prompt, 1, 120)) AS title,
                p.name AS project
         FROM sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ?`,
      )
      .get(target.sessionId);
    const previous = this.db
      .query<{ headline: string | null }, [string, number]>(
        `SELECT COALESCE(sm.headline, g.fallback_title) AS headline
         FROM segments g LEFT JOIN summaries sm ON sm.session_id = g.session_id AND sm.start = g.start
         WHERE g.session_id = ? AND g.start < ? ORDER BY g.start`,
      )
      .all(target.sessionId, target.start)
      .map((r) => r.headline)
      .filter((h): h is string => Boolean(h))
      .slice(-8);
    const messages = this.db
      .query<DigestMessage, [string, number, number]>(
        `SELECT kind, text, tool_name FROM messages
         WHERE session_id = ? AND agent_id IS NULL AND is_copy = 0 AND is_scheduled = 0
           AND ts BETWEEN ? AND ? ORDER BY file_id, seq`,
      )
      .all(target.sessionId, target.start, seg.end);
    const digest = buildDigest(messages);
    if (!digest) return null;
    return {
      end: seg.end,
      prompt: {
        sessionTitle: session?.title?.split("\n")[0] ?? "(untitled)",
        projectName: session?.project ?? null,
        previous,
        digest,
      },
    };
  }
}
