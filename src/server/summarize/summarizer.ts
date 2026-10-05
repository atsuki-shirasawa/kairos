import type { Database } from "bun:sqlite";
import {
  AUTO_SUMMARY_DAYS,
  SECTION_IDLE_MS,
  SUMMARY_MIN_DURATION_MS,
  SUMMARY_MIN_PROMPTS,
} from "../../shared/sections.ts";
import { buildDigest, type DigestMessage } from "./digest.ts";
import { buildPrompt, parseSummary } from "./prompt.ts";

export const DEFAULT_MODEL = "haiku";
const POLL_MS = 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 60_000;

export type Runner = (prompt: string) => Promise<string>;

interface Target {
  sessionId: string;
  start: number;
}

interface Failure {
  attempts: number;
  retryAt: number;
  message: string;
}

const key = (t: Target) => `${t.sessionId}:${t.start}`;

/**
 * 終わったセクションの要約を、1 件ずつ順に作る。
 * 自動で作るのは直近のセクションだけで、それより前は `request` で頼まれたときに作る。
 */
export class Summarizer {
  private readonly queue: Target[] = [];
  private readonly failures = new Map<string, Failure>();
  private current: string | null = null;
  private running = false;
  private wake: (() => void) | null = null;

  constructor(
    private readonly db: Database,
    private readonly run: Runner,
    private readonly opts: {
      model?: string;
      now?: () => number;
      onUpdated?: (target: Target) => void;
      /** false なら自動では作らず、頼まれたものだけ作る。 */
      auto?: boolean;
    } = {},
  ) {}

  get model(): string {
    return this.opts.model ?? DEFAULT_MODEL;
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  isPending(sessionId: string, start: number): boolean {
    const k = key({ sessionId, start });
    return this.current === k || this.queue.some((t) => key(t) === k);
  }

  errorOf(sessionId: string, start: number): string | null {
    return this.failures.get(key({ sessionId, start }))?.message ?? null;
  }

  /** このセクションを優先して要約する（作り直しも含む）。 */
  request(sessionId: string, start: number): void {
    const target = { sessionId, start };
    this.failures.delete(key(target));
    if (!this.isPending(sessionId, start)) this.queue.unshift(target);
    this.poke();
  }

  /** 取り込みでセッションが更新されたときに呼ぶ。要約できるセクションが増えたかもしれない。 */
  poke(): void {
    this.wake?.();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
    this.poke();
  }

  /** 次に要約するセクション。頼まれたものが先、次に自動の対象（新しいものから）。 */
  next(): Target | null {
    const requested = this.queue.shift();
    if (requested) return requested;
    if (this.opts.auto === false) return null;
    const now = this.now();
    const rows = this.db
      .query<{ session_id: string; start: number }, [number, number, number]>(
        `SELECT g.session_id, g.start
         FROM segments g
         JOIN sessions s ON s.id = g.session_id
         LEFT JOIN summaries sm ON sm.session_id = g.session_id AND sm.start = g.start
         WHERE s.prompt_count > 0
           AND (g.end - g.start >= ${SUMMARY_MIN_DURATION_MS} OR g.prompt_count >= ${SUMMARY_MIN_PROMPTS})
           AND g.end >= ?1
           AND (g.end <= ?2 OR EXISTS (SELECT 1 FROM segments later WHERE later.session_id = g.session_id AND later.start > g.start))
           AND (sm.session_id IS NULL OR sm.covered_until < g.end)
         ORDER BY g.end DESC
         LIMIT ?3`,
      )
      .all(now - AUTO_SUMMARY_DAYS * 24 * 60 * 60_000, now - SECTION_IDLE_MS, 50);
    for (const r of rows) {
      const t = { sessionId: r.session_id, start: r.start };
      const f = this.failures.get(key(t));
      if (f && (f.attempts >= MAX_ATTEMPTS || f.retryAt > now)) continue;
      return t;
    }
    return null;
  }

  private async loop(): Promise<void> {
    while (this.running) {
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

  /** 1 セクションを要約して保存する。失敗は記録して、時間をおいて再試行する。 */
  async summarize(target: Target): Promise<boolean> {
    const k = key(target);
    this.current = k;
    try {
      const input = this.load(target);
      if (!input) return false;
      const parsed = parseSummary(await this.run(buildPrompt(input.prompt)));
      if (!parsed) throw new Error("要約の形式を読み取れませんでした");
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
          parsed.body,
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

  private load(target: Target): { end: number; prompt: Parameters<typeof buildPrompt>[0] } | null {
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
        sessionTitle: session?.title?.split("\n")[0] ?? "（無題）",
        projectName: session?.project ?? null,
        previous,
        digest,
      },
    };
  }
}
