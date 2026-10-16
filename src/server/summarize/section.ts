// One section summary: preparing the prompt (with the earlier open items a full summary may
// settle), asking the model until its answer is fit to save, and interpreting that answer into what
// is saved. The summarizer supplies the runner; `store.ts` persists the result.
import type { Database } from "bun:sqlite";
import type { OpenItem } from "../../shared/summaryBody.ts";
import type { SummaryLang } from "../../shared/summaryLang.ts";
import { type Runner, type RunStats, readEnvelope } from "./claude.ts";
import { type HeadlineFlaw, headlineFlaws } from "./headline.ts";
import { labelCandidates, loadCandidates } from "./ledger/candidates.ts";
import type { LedgerItem } from "./ledger/items.ts";
import type { LedgerUpdate } from "./ledger/record.ts";
import {
  type Closure,
  readSummary,
  readTitle,
  renderBody,
  SUMMARY_SCHEMA,
  TITLE_SCHEMA,
} from "./output.ts";
import {
  buildPrompt,
  buildTitlePrompt,
  type EarlierOpen,
  PROMPT_VERSION,
  type PromptInput,
} from "./prompt.ts";
import {
  loadSectionInput,
  type SectionInput,
  type SectionResult,
  type SummaryText,
} from "./store.ts";
import type { Mode, Target } from "./target.ts";

/** A model's answer as what is saved: the summary, and its changes to the ledger. */
export interface SectionAnswer {
  /** The body is empty for a headline-only answer. */
  summary: SummaryText;
  /** What the section left open, as new ledger items. */
  opened: OpenItem[];
  /** The earlier items it said it settled, by label. */
  closures: Closure[];
}

/** How one mode of summary differs: what it is shown, how it asks, and what it keeps. */
interface ModeStrategy {
  /** Earlier open items the section may have settled, as candidates for the prompt. */
  candidates(db: Database, target: Target, input: SectionInput): LedgerItem[];
  /** The prompt for the section. */
  buildPrompt(input: PromptInput, lang: SummaryLang): string;
  /** The schema the answer follows. */
  schema: object;
  /** The answer as what is saved, or null when it lacks what the mode needs. */
  read(output: unknown, lang: SummaryLang): SectionAnswer | null;
}

/**
 * A full summary is shown the earlier open items and reports which it closed. A headline-only one
 * isn't (a headline can't say what it settled), and its body is kept empty.
 */
const MODES: Record<Mode, ModeStrategy> = {
  summary: {
    candidates: (db, target, input) => loadCandidates(db, target, input.refs),
    buildPrompt,
    schema: SUMMARY_SCHEMA,
    read: (output, lang) => {
      const s = readSummary(output);
      if (!s) return null;
      const summary = { headline: s.headline, short: s.short, body: renderBody(s, lang) };
      return { summary, opened: s.open, closures: s.closed };
    },
  },
  title: {
    candidates: () => [],
    buildPrompt: buildTitlePrompt,
    schema: TITLE_SCHEMA,
    read: (output) => {
      const t = readTitle(output);
      return t && { summary: { ...t, body: "" }, opened: [], closures: [] };
    },
  },
};

/** What to ask the model for one section: the prompt, and the mode and language it answers in. */
export interface SectionRequest {
  prompt: string;
  mode: Mode;
  lang: SummaryLang;
}

/** A section ready to send to the model, with what interpreting its output needs. */
export interface PreparedSection extends SectionRequest {
  target: Target;
  input: SectionInput;
  /** Earlier open items offered to the model, in label order. */
  candidates: LedgerItem[];
  /** The candidates as the prompt names them (O1, O2, …). */
  labeled: EarlierOpen[];
}

/**
 * Loads the section and builds its prompt for the target's mode, or says there is nothing to
 * summarize: the section is gone or has no conversation in it (e.g. only scheduled runs).
 */
export function prepareSection(
  db: Database,
  target: Target,
  lang: SummaryLang,
): PreparedSection | "no-conversation" {
  const input = loadSectionInput(db, target);
  if (!input) return "no-conversation";
  const mode = MODES[target.mode];
  const candidates = mode.candidates(db, target, input);
  const labeled = labelCandidates(candidates, target.sessionId);
  const prompt = mode.buildPrompt({ ...input.prompt, earlierOpen: labeled }, lang);
  return { target, input, candidates, labeled, prompt, mode: target.mode, lang };
}

/** A model's answer that is fit to save, with what getting it cost. */
export interface AnsweredSection {
  answer: SectionAnswer;
  /** Summed over every ask, including a rejected one. */
  stats: RunStats;
  /** How many times the model was asked (1, or 2 after a rejected answer). */
  asks: number;
}

/**
 * How many times one attempt asks the model. An answer that talks about the task instead of the
 * work is usually fine on a second ask; past that, the attempt fails and is retried later.
 */
const MAX_ASKS = 2;

/** Headline flaws worth another ask. A length a little off still names the work, so it is kept. */
const ASK_AGAIN_FOR: readonly HeadlineFlaw[] = ["meta", "sentence"];
/** Flaws that still fail the attempt on the last ask; a sentence names the work all the same. */
const FAIL_FOR: readonly HeadlineFlaw[] = ["meta"];

/**
 * What is wrong with a headline, worded for both the server log and the model's next ask. The
 * headline itself stays out: it quotes the log, which the server log shouldn't hold.
 */
const FLAW_PROBLEMS: Partial<Record<HeadlineFlaw, string>> = {
  meta: "The headline talked about the task or the summary instead of naming the work",
  sentence: "The headline was a sentence rather than a title",
};

/** Why an answer can't be saved when it lacks what its mode needs. */
const INCOMPLETE = "The answer lacked a headline, a goal or the work done";

/** Why the model's answers to one attempt weren't saved, with what asking for them cost. */
export class UnfitAnswerError extends Error {
  constructor(
    message: string,
    /** Summed over every ask. */
    readonly stats: RunStats,
    /** How many times the model was asked. */
    readonly asks: number,
  ) {
    super(message);
  }
}

/**
 * The answer when it is fit to save, else why it isn't. Only the `rejected` flaws count against
 * the headline. A short title that talks about the task is dropped rather than failing the answer.
 */
function checkAnswer(
  output: unknown,
  req: SectionRequest,
  rejected: readonly HeadlineFlaw[],
): SectionAnswer | string {
  const answer = MODES[req.mode].read(output, req.lang);
  if (!answer) return INCOMPLETE;
  const { headline, short } = answer.summary;
  const problems = headlineFlaws(headline, req.lang)
    .filter((f) => rejected.includes(f))
    .map((f) => FLAW_PROBLEMS[f]);
  if (problems.length) return problems.join("; ");
  const metaShort = short !== null && headlineFlaws(short, req.lang).includes("meta");
  return metaShort ? { ...answer, summary: { ...answer.summary, short: null } } : answer;
}

/** The prompt for another ask: the same one, told what was wrong with the last answer. */
function askAgain(prompt: string, problem: string): string {
  return `${prompt}
An earlier answer to this was rejected: ${problem}. Answer again, following the rules above.
`;
}

const addStats = (a: RunStats, b: RunStats): RunStats => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  costUsd: a.costUsd + b.costUsd,
  latencyMs: a.latencyMs + b.latencyMs,
});

const NO_STATS: RunStats = { inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 };

/**
 * Asks the model for the section's summary (or headline), asking once more, told why, when the
 * answer is unreadable or its headline is unfit. Throws an `UnfitAnswerError` when the last answer
 * is still unreadable or talks about the task, so the attempt is retried later and the block keeps
 * its fallback title meanwhile.
 */
export async function answerSection(run: Runner, req: SectionRequest): Promise<AnsweredSection> {
  let stats = NO_STATS;
  let problem = "";
  for (let asks = 1; asks <= MAX_ASKS; asks++) {
    const prompt = problem ? askAgain(req.prompt, problem) : req.prompt;
    const reply = readEnvelope(await run(prompt, MODES[req.mode].schema));
    stats = addStats(stats, reply.stats);
    const checked = checkAnswer(reply.output, req, asks < MAX_ASKS ? ASK_AGAIN_FOR : FAIL_FOR);
    if (typeof checked !== "string") return { answer: checked, stats, asks };
    problem = checked;
  }
  throw new UnfitAnswerError(problem, stats, MAX_ASKS);
}

/**
 * The answer as what to save: the summary, how it was written, the section's Open items as new
 * ledger items, and the earlier items it said it closed, by ID (a label not offered is ignored).
 */
export function interpretSection(
  { answer, stats }: AnsweredSection,
  prepared: PreparedSection,
): SectionResult {
  return {
    blockId: prepared.input.blockId,
    summary: answer.summary,
    run: { promptVersion: PROMPT_VERSION, inputHash: promptHash(prepared.prompt), ...stats },
    ledger: {
      end: prepared.input.end,
      opened: answer.opened,
      tasks: prepared.input.tasks,
      closed: closedIds(answer.closures, prepared),
    },
  };
}

/** Which input a summary was written from: equal prompts give equal hashes. */
function promptHash(prompt: string): string {
  return Bun.hash(prompt).toString(16);
}

/** The closures whose label names an offered candidate, by the candidate's ID. */
function closedIds(closures: Closure[], prepared: PreparedSection): LedgerUpdate["closed"] {
  const idOf = new Map(prepared.labeled.map((l, n) => [l.label, prepared.candidates[n]?.id]));
  return closures.flatMap((c) => {
    const id = idOf.get(c.label);
    return id === undefined ? [] : [{ id, note: c.note }];
  });
}
