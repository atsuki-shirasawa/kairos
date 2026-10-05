// Prompts for section summaries, and parsing of the output.

/** Language the summaries are written in. Set with `--summary-lang`. */
export type SummaryLang = "en" | "ja";

/** Summary language when neither `--summary-lang` nor the UI has chosen one. */
export const DEFAULT_SUMMARY_LANG: SummaryLang = "en";

/** Whether the value is a supported summary language (validates API input and stored settings). */
export function isSummaryLang(v: unknown): v is SummaryLang {
  return v === "en" || v === "ja";
}

/** What a section summary prompt is built from. */
export interface PromptInput {
  sessionTitle: string;
  projectName: string | null;
  /** Headlines of the sections before this one in the same session. */
  previous: string[];
  digest: string;
}

interface LangRules {
  name: string;
  headline: string;
  goal: string;
  done: string;
  outcome: string;
}

const RULES: Record<SummaryLang, LangRules> = {
  en: {
    name: "English",
    headline: "a short noun phrase of about 3–8 words, no trailing period, no quotes or symbols",
    goal: "Goal",
    done: "Done",
    outcome: "Outcome",
  },
  // A Japanese headline reads best as a short noun-ending phrase (体言止め)
  ja: {
    name: "Japanese",
    headline: "15〜35 字、体言止め、記号や引用符なし",
    goal: "目的",
    done: "やったこと",
    outcome: "結果",
  },
};

function contextOf(input: PromptInput): string {
  return [
    `Session title: ${input.sessionTitle}`,
    input.projectName ? `Project: ${input.projectName}` : null,
    input.previous.length
      ? `Earlier work in this session:\n${input.previous.map((h) => `- ${h}`).join("\n")}`
      : "This is the first piece of work in this session.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Prompt asking for a headline plus a goal / done / outcome body for one section. */
export function buildPrompt(input: PromptInput, lang: SummaryLang = DEFAULT_SUMMARY_LANG): string {
  const r = RULES[lang];
  return `Below is an excerpt from one continuous stretch of work (a section) in a Claude Code session.
Write a summary in ${r.name} so that, looking back later on a calendar, it is clear what was done during this time.

Output format (Markdown; no preamble or closing remarks):
Line 1: a headline describing the work in this section (${r.headline})
Blank line
- ${r.goal}: …
- ${r.done}: … (the main work, 1–3 points)
- ${r.outcome}: … (what was finished, commits or PRs, open issues)

<context>
${contextOf(input)}
</context>

<transcript>
${input.digest}
</transcript>
`;
}

/**
 * Prompt for just a headline for a short section (one not summarized in full).
 * Using the first prompt verbatim gives headlines like "please do it", so derive one from the content.
 */
export function buildTitlePrompt(
  input: PromptInput,
  lang: SummaryLang = DEFAULT_SUMMARY_LANG,
): string {
  const r = RULES[lang];
  return `Below is a short stretch of work (a section) in a Claude Code session.
Write a single-line headline in ${r.name} for looking back at it later on a calendar (${r.headline}).
Write nothing other than the headline.

<context>
${contextOf(input)}
</context>

<transcript>
${input.digest}
</transcript>
`;
}

/** A summary split into its headline and Markdown body. */
export interface ParsedSummary {
  headline: string;
  body: string;
}

/** Reads the first line as the headline and the rest as the body. Strips headline decorations (#, quotes). */
export function parseSummary(output: string): ParsedSummary | null {
  const lines = output.trim().split("\n");
  const first = lines.findIndex((l) => l.trim());
  if (first === -1) return null;
  const headline = (lines[first] ?? "")
    .replace(/^#+\s*/, "")
    .replace(/^(?:見出し|headline)[:：]\s*/i, "")
    .replace(/^[「『"“]|[」』"”]$/g, "")
    .replace(/\*\*/g, "")
    .trim()
    .slice(0, 80);
  const body = lines
    .slice(first + 1)
    .join("\n")
    .trim();
  return headline ? { headline, body } : null;
}
