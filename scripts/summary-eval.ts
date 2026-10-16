// Summarizes the fictional cases in tests/fixtures/summary-eval.ts with `claude -p`, through the
// same ask-and-check as the summarizer, and scores the summaries: open items found, false
// "resolved", leftovers that aren't, too many open items, unfit headlines, and format adherence.
// Not part of `bun run check`, since it calls the model. Usage:
//   bun run eval:summary [--model haiku] [--effort low] [--runs 1] [--case <id>] [--out <file.json>]
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { serverEnv } from "../src/cli/daemon.ts";
import {
  claudeRunner,
  DEFAULT_EFFORT,
  isEffort,
  type RunStats,
} from "../src/server/summarize/claude.ts";
import { type HeadlineFlaw, headlineFlaws } from "../src/server/summarize/headline.ts";
import { buildPrompt } from "../src/server/summarize/prompt.ts";
import {
  type AnsweredSection,
  answerSection,
  UnfitAnswerError,
} from "../src/server/summarize/section.ts";
import type { SummaryText } from "../src/server/summarize/store.ts";
import { DEFAULT_MODEL } from "../src/server/summarize/summarizer.ts";
import { type OpenItem, parseSummaryBody } from "../src/shared/summaryBody.ts";
import { EVAL_CASES, type EvalCase, MAX_OPEN } from "../tests/fixtures/summary-eval.ts";

/** A summary as scored: its headline and its stored Markdown body. */
export type ScoredSummary = Pick<SummaryText, "headline" | "body">;

/** One case's run as the report keeps it: the summary, or why none could be saved. */
interface Outcome extends ScoredSummary {
  id: string;
  run: number;
  asks: number;
  stats: RunStats;
  error?: string;
}

/**
 * A case's answer as an outcome. One the summarizer would fail to save has no summary, and scores
 * as one that didn't parse.
 */
function outcomeOf(
  answered: AnsweredSection | UnfitAnswerError,
  at: { id: string; run: number },
): Outcome {
  if (answered instanceof UnfitAnswerError) {
    const { stats, asks, message } = answered;
    return { ...at, headline: "", body: "", asks, stats, error: message };
  }
  const { headline, body } = answered.answer.summary;
  return { ...at, headline, body, asks: answered.asks, stats: answered.stats };
}

/** How one summary did against its case. */
export interface CaseScore {
  id: string;
  /** Whether the body parsed into the summary's items. */
  parsed: boolean;
  /** Expected open items found, out of `openExpected`. */
  openFound: number;
  openExpected: number;
  /** Found open items whose kind fits. */
  kindFit: number;
  /** Resolved items that name something the facts show as not settled. */
  falseResolved: string[];
  /** Open items that aren't the section's leftovers (backlog order, finished work). */
  falseOpen: string[];
  /** Open items that don't say which thing is left. */
  vagueOpen: string[];
  /** Expected open items that weren't found, for the report. */
  missed: string[];
  /**
   * Open items that match no expected one. Not counted against the summary, since a case can't
   * list every fair way to split a leftover, but shown so an invented one gets noticed.
   */
  extraOpen: string[];
  /** Items that only say there is nothing for them ("Next: not stated"), which should be left out. */
  filler: string[];
  /** Open items beyond what the case allows (`maxOpen`, else `MAX_OPEN`). */
  overOpen: number;
  /** The first open item, when the case names the one that should lead and it doesn't. */
  wrongLead: string | null;
  /** How the headline fails the rules (see `headlineFlaws`). */
  headline: HeadlineFlaw[];
}

/** "The rest", "remaining items" and the like: a leftover that doesn't say which. */
const VAGUE =
  /\b(?:the rest(?! of)|remaining (?:items|findings|issues|work)|other items)\b|残りの|その他の/i;

/** An item that only says there is nothing to say. */
const FILLER =
  /^(?:none|nothing\b|n\/a\b|not (?:stated|recorded|mentioned|given)|なし|特になし|記載なし|特に(?:ない|ありません))/i;

const has = (text: string, terms: string[]) =>
  terms.some((t) => text.toLowerCase().includes(t.toLowerCase()));

/** Every top-level item's text, read loosely, so filler the parser drops still shows. */
function* items(body: string): Generator<string> {
  for (const m of body.matchAll(/^[-*+]\s+[^:：\n]+[:：]\s*(.+)$/gm)) if (m[1]) yield m[1].trim();
}

/** The first open item when the case names the one that should lead and it isn't that one. */
function wrongLead(c: EvalCase, open: OpenItem[]): string | null {
  const [first] = open;
  if (!c.leadOpen || !first) return null;
  return has(first.text, c.leadOpen) ? null : first.text;
}

/** Scores one summary against its case. Pure, so the tests can check it on the ideal summaries. */
export function scoreCase(c: EvalCase, { headline, body }: ScoredSummary): CaseScore {
  const parts = parseSummaryBody(body);
  const open = parts?.open ?? [];
  const resolved = parts?.resolved ?? [];
  const found = c.open.map((e) => open.find((o) => has(o.text, e.match)));
  return {
    id: c.id,
    parsed: parts !== null,
    openFound: found.filter(Boolean).length,
    openExpected: c.open.length,
    kindFit: found.filter((o, i) => o?.kind && c.open[i]?.kinds.includes(o.kind)).length,
    falseResolved: resolved.filter((r) => has(r, c.notResolved)),
    falseOpen: open.filter((o) => has(o.text, c.notOpen)).map((o) => o.text),
    vagueOpen: open.filter((o) => VAGUE.test(o.text)).map((o) => o.text),
    missed: c.open.filter((_, i) => !found[i]).map((e) => e.what),
    extraOpen: open.filter((o) => !c.open.some((e) => has(o.text, e.match))).map((o) => o.text),
    filler: [...items(body)].filter((t) => FILLER.test(t)),
    overOpen: Math.max(0, open.length - (c.maxOpen ?? MAX_OPEN)),
    wrongLead: wrongLead(c, open),
    // An output that didn't parse has no headline; it already counts as not parsed
    headline: headline ? headlineFlaws(headline, c.lang) : [],
  };
}

/** Totals across scores, as the report's last lines. */
export function totals(scores: CaseScore[]) {
  const sum = (f: (s: CaseScore) => number) => scores.reduce((n, s) => n + f(s), 0);
  const found = sum((s) => s.openFound);
  return {
    summaries: scores.length,
    parsed: sum((s) => (s.parsed ? 1 : 0)),
    openRecall: `${found}/${sum((s) => s.openExpected)}`,
    kindFit: `${sum((s) => s.kindFit)}/${found}`,
    falseResolved: sum((s) => s.falseResolved.length),
    falseOpen: sum((s) => s.falseOpen.length),
    vagueOpen: sum((s) => s.vagueOpen.length),
    extraOpen: sum((s) => s.extraOpen.length),
    filler: sum((s) => s.filler.length),
    overOpen: sum((s) => s.overOpen),
    wrongLead: sum((s) => (s.wrongLead ? 1 : 0)),
    badHeadlines: sum((s) => (s.headline.length > 0 ? 1 : 0)),
  };
}

function report(s: CaseScore, headline: string): string {
  const flags = [
    s.parsed ? null : "NOT PARSED",
    ...s.missed.map((m) => `missed open: ${m}`),
    ...s.falseResolved.map((r) => `false resolved: ${r}`),
    ...s.falseOpen.map((o) => `not a leftover: ${o}`),
    ...s.vagueOpen.map((o) => `vague: ${o}`),
    ...s.filler.map((f) => `filler: ${f}`),
    s.overOpen > 0 ? `${s.overOpen} open item(s) over the limit` : null,
    s.wrongLead ? `should not lead: ${s.wrongLead}` : null,
    s.headline.length > 0 ? `headline (${s.headline.join(", ")})` : null,
    ...s.extraOpen.map((o) => `(extra open: ${o})`),
  ].filter(Boolean);
  const head = `${s.id}: open ${s.openFound}/${s.openExpected}, kind ${s.kindFit}, headline "${headline}"`;
  return [head, ...flags.map((f) => `    ${f}`)].join("\n");
}

async function main() {
  const { values } = parseArgs({
    options: {
      model: { type: "string", default: DEFAULT_MODEL },
      effort: { type: "string", default: DEFAULT_EFFORT },
      runs: { type: "string", default: "1" },
      case: { type: "string" },
      out: { type: "string" },
    },
  });
  const effort = values.effort;
  if (!isEffort(effort)) throw new Error(`unknown effort: ${effort}`);
  const cases = EVAL_CASES.filter((c) => !values.case || c.id === values.case);
  if (cases.length === 0) throw new Error(`no case named ${values.case}`);
  const cwd = join(tmpdir(), "kairos-summary-eval");
  mkdirSync(cwd, { recursive: true });
  // This usually runs inside a Claude Code session, whose variables must not reach claude -p
  const opts = { model: values.model, effort, cwd, env: serverEnv() };

  const ask = claudeRunner(opts);

  const scores: CaseScore[] = [];
  const outputs: Outcome[] = [];
  for (let run = 1; run <= Number(values.runs); run++) {
    // One case at a time: claude -p runs on the plan's usage, and the cases are few
    for (const c of cases) {
      const req = { prompt: buildPrompt(c.input, c.lang), mode: "summary" as const, lang: c.lang };
      const answered = await answerSection(ask, req).catch((e: unknown) => {
        if (e instanceof UnfitAnswerError) return e;
        throw e;
      });
      const outcome = outcomeOf(answered, { id: c.id, run });
      outputs.push(outcome);
      if (outcome.error) console.log(`${c.id}: FAILED ${outcome.error}`);
      const score = scoreCase(c, outcome);
      scores.push(score);
      console.log(report(score, outcome.headline));
    }
  }
  const sum = (f: (s: RunStats) => number) => outputs.reduce((n, o) => n + f(o.stats), 0);
  console.log("\n", {
    ...totals(scores),
    askedAgain: outputs.filter((o) => o.asks > 1).length,
    failed: outputs.filter((o) => o.error).length,
    costUsd: Number(sum((s) => s.costUsd).toFixed(4)),
    meanLatencyMs: Math.round(sum((s) => s.latencyMs) / Math.max(1, outputs.length)),
  });
  if (values.out) {
    await Bun.write(values.out, JSON.stringify({ opts: values, scores, outputs }, null, 2));
    console.log(`wrote ${values.out}`);
  }
}

if (import.meta.main) await main();
