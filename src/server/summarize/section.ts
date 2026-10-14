// One section summary, before and after the model: preparing the prompt (with the earlier open
// items a full summary may settle) and interpreting the output into what is saved. The summarizer
// runs the model between the two; `store.ts` persists the result.
import type { Database } from "bun:sqlite";
import { parseSummaryBody } from "../../shared/summaryBody.ts";
import type { SummaryLang } from "../../shared/summaryLang.ts";
import { labelCandidates, loadCandidates } from "./ledger/candidates.ts";
import type { LedgerItem } from "./ledger/items.ts";
import type { LedgerUpdate } from "./ledger/record.ts";
import {
  buildPrompt,
  buildTitlePrompt,
  type Closure,
  type EarlierOpen,
  type PromptInput,
  parseSummary,
  takeClosures,
} from "./prompt.ts";
import { loadSectionInput, type SectionInput, type SectionResult } from "./store.ts";
import type { Mode, Target } from "./target.ts";

/** How one mode of summary differs: what it is shown, how it asks, and what it keeps. */
interface ModeStrategy {
  /** Earlier open items the section may have settled, as candidates for the prompt. */
  candidates(db: Database, target: Target, input: SectionInput): LedgerItem[];
  /** The prompt for the section. */
  buildPrompt(input: PromptInput, lang: SummaryLang): string;
  /** The parsed body split into what is saved and the closures the model reported. */
  splitBody(body: string): { body: string; closures: Closure[] };
}

/**
 * A full summary is shown the earlier open items and reports which it closed. A headline-only one
 * isn't (a headline can't say what it settled), and its body is kept empty, discarding any extra
 * lines after the headline.
 */
const MODES: Record<Mode, ModeStrategy> = {
  summary: {
    candidates: (db, target, input) => loadCandidates(db, target, input.refs),
    buildPrompt,
    splitBody: takeClosures,
  },
  title: {
    candidates: () => [],
    buildPrompt: buildTitlePrompt,
    splitBody: () => ({ body: "", closures: [] }),
  },
};

/** A section ready to send to the model, with what interpreting its output needs. */
export interface PreparedSection {
  target: Target;
  input: SectionInput;
  /** Earlier open items offered to the model, in label order. */
  candidates: LedgerItem[];
  /** The candidates as the prompt names them (O1, O2, …). */
  labeled: EarlierOpen[];
  prompt: string;
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
  return { target, input, candidates, labeled, prompt };
}

/**
 * The model's output as what to save: the headline and body, the body's Open items as new ledger
 * items, and the earlier items it said it closed, by ID (a label that wasn't offered is ignored).
 * Null when the output has no headline.
 */
export function interpretSection(output: string, prepared: PreparedSection): SectionResult | null {
  const parsed = parseSummary(output);
  if (!parsed) return null;
  const { body, closures } = MODES[prepared.target.mode].splitBody(parsed.body);
  return {
    summary: { headline: parsed.headline, body },
    ledger: {
      end: prepared.input.end,
      opened: parseSummaryBody(body)?.open ?? [],
      tasks: prepared.input.tasks,
      closed: closedIds(closures, prepared),
    },
  };
}

/** The closures whose label names an offered candidate, by the candidate's ID. */
function closedIds(closures: Closure[], prepared: PreparedSection): LedgerUpdate["closed"] {
  const idOf = new Map(prepared.labeled.map((l, n) => [l.label, prepared.candidates[n]?.id]));
  return closures.flatMap((c) => {
    const id = idOf.get(c.label);
    return id === undefined ? [] : [{ id, note: c.note }];
  });
}
