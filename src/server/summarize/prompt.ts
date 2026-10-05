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
    headline: "15〜35 字、体言止め（「〜した」「〜し、〜」で終えない）、記号や引用符なし",
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

/**
 * What makes a headline useful on a calendar, shared by both prompts. Written from looking at real
 * output: haiku tended to write "review fixes" without saying what was fixed, to pad with
 * "done"/"started", and to cover a long section with "from A to B".
 */
function headlineRules(r: LangRules): string {
  return `Headline rules (${r.headline}):
- Name the concrete thing worked on (a feature, screen, file, command, PR or ticket number, bug), so the headline alone says what the work was. Generic verbs like fix, improve, implement or address need their object, and "review fixes" should say what the fixes changed.
- Keep names (projects, files, commands, tickets) as written in the transcript; don't translate or transliterate them.
- Describe the work, not its progress: leave out words like done, completed, started, progress or achieved.
- If the section holds several pieces of work, name the main one or two, not a "from A to B" span.
- Write the headline itself, with no label such as "Headline" or "Summary" before it.`;
}

/** Prompt asking for a headline plus a goal / done / outcome body for one section. */
export function buildPrompt(input: PromptInput, lang: SummaryLang = DEFAULT_SUMMARY_LANG): string {
  const r = RULES[lang];
  return `Below is an excerpt from one continuous stretch of work (a section) in a Claude Code session.
Write a summary in ${r.name} so that, looking back later on a calendar, it is clear what was done during this time.

Output format (Markdown; no preamble or closing remarks):
Line 1: the headline
Blank line
- ${r.goal}: …
- ${r.done}:
  - … (the main work, 1–3 points; a long section with several distinct pieces of work may have up to 5, in the order they happened)
- ${r.outcome}: … (what was finished, commits or PRs, open issues)

Use exactly these three top-level items, as plain "- " bullets with no bold, numbering or blank lines between them.

${headlineRules(r)}

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
Write a single-line headline in ${r.name} for looking back at it later on a calendar.
Write nothing other than the headline. If the excerpt shows only a request and no result, describe what was asked.

${headlineRules(r)}

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

/**
 * Drops blank lines before list items. The model often spaces its bullets out, which renders as a
 * loose list with paragraph gaps; summaries side by side read better when they all look the same.
 */
function tightenList(body: string): string {
  return body.replace(/\n[ \t]*\n+(?=[ \t]*(?:[-*+]|\d+\.)\s)/g, "\n");
}

/** A line holding only a label, which the model sometimes writes above the real headline. */
const LABEL_LINE =
  /^\s*#*\s*\**(?:見出し|サマリー|要約|まとめ|headline|summary)\s*[:：]?\s*\**\s*[:：]?\s*$/i;

/** Reads the first line as the headline and the rest as the body. Strips headline decorations (#, quotes). */
export function parseSummary(output: string): ParsedSummary | null {
  const lines = output.trim().split("\n");
  const first = lines.findIndex((l) => l.trim() && !LABEL_LINE.test(l));
  if (first === -1) return null;
  const headline = (lines[first] ?? "")
    // A Markdown heading needs the space; without it, "#1542 ..." is an issue number to keep
    .replace(/^#+\s+/, "")
    .replace(/^(?:見出し|headline)[:：]\s*/i, "")
    .replace(/^[「『"“]|[」』"”]$/g, "")
    .replace(/\*\*/g, "")
    .trim()
    .slice(0, 80);
  const body = tightenList(
    lines
      .slice(first + 1)
      .join("\n")
      .trim(),
  );
  return headline ? { headline, body } : null;
}
