// What makes a summary headline unfit for the calendar, where it is the most visible text. About 4%
// of real headlines were the model talking about the task instead ("Here is the summary:", "Hmm,
// wait — let me reconsider", the prompt's own rule echoed back), and some were whole sentences.
import type { SummaryLang } from "../../shared/summaryLang.ts";

/**
 * How long a headline should be, per summary language: Japanese counts characters, English words.
 * The prompt states it, and `headlineFlaws` checks it, from this one definition.
 */
export const HEADLINE_LENGTH: Record<SummaryLang, { min: number; max: number }> = {
  en: { min: 3, max: 8 },
  ja: { min: 15, max: 35 },
};

/**
 * A way a headline fails: it talks about the task or the model's own process (`meta`), reads as a
 * sentence rather than a title (`sentence`), or is outside `HEADLINE_LENGTH` (`length`).
 */
export type HeadlineFlaw = "meta" | "sentence" | "length";

/**
 * The model speaking about its task (the summary, the headline, the format) or its own process,
 * instead of naming the work. Work on summaries themselves stays fine ("要約プロンプト改善"): only
 * phrases about writing this summary count.
 */
const META_RE = new RegExp(
  [
    // English: announcing, hesitating, or quoting the instructions
    String.raw`^_?headline_?\s*[—:–-]`,
    String.raw`\b(?:here(?:['’]s| is)|let me|i['’]m going to|i will|i['’]ll)\b`,
    String.raw`\b(?:hmm|wait)\s*[,.!—–]`,
    String.raw`\b(?:writing|sending|noting) (?:the|this) (?:section )?summary`,
    String.raw`\bthe (?:section )?summary (?:should|must|is|now)\b`,
    String.raw`\bin the requested format\b|\bline 1 must\b`,
    // Answering something around the prompt rather than summarizing the section
    String.raw`\b(?:the section above|system-style|environment block)\b`,
    // Japanese: the same, and a headline that says it is one
    String.raw`(?:まとめ|書き|出力し|記録し)ます|見出し(?:のみ|にする)|記録する見出し`,
    String.raw`ヘッドラインは|見出しに入れ|作業のみ記述|ご指定|指定された(?:形式|トランスクリプト)|任務です`,
    String.raw`^ここでは|^以下、|(?:セクション|この作業)の?要約$`,
    // The body's first item where the headline should be: the model skipped the headline
    String.raw`^[-*+]\s`,
  ].join("|"),
  "i",
);

/** A sentence's ending: a full stop, or a polite or past-tense verb (the rules ask for 体言止め). */
const SENTENCE_END: Record<SummaryLang, RegExp> = {
  en: /[.!?:]$/,
  ja: /(?:[。.:：]|ます|ました|です|でした|ません|した)$/,
};

/**
 * How long the headline is in the unit `HEADLINE_LENGTH` counts for the language. Japanese counts
 * characters without the spaces put around English words and numbers, as a reader would.
 */
function lengthOf(headline: string, lang: SummaryLang): number {
  const words = headline.split(/\s+/).filter(Boolean);
  return lang === "ja" ? [...words.join("")].length : words.length;
}

/** The ways the headline fails the rules, empty for a fit one. */
export function headlineFlaws(headline: string, lang: SummaryLang): HeadlineFlaw[] {
  const text = headline.trim();
  const { min, max } = HEADLINE_LENGTH[lang];
  const length = lengthOf(text, lang);
  return [
    META_RE.test(text) ? ("meta" as const) : null,
    SENTENCE_END[lang].test(text) ? ("sentence" as const) : null,
    length < min || length > max ? ("length" as const) : null,
  ].filter((f) => f !== null);
}
