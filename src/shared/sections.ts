// セクション（作業ブロック）の要約に関する決まりごと。サーバーとフロントで共有する。

/** これ以上の長さか、これ以上の発言があるセクションだけ LLM で要約する。 */
export const SUMMARY_MIN_DURATION_MS = 10 * 60_000;
export const SUMMARY_MIN_PROMPTS = 2;
/** 最後の活動からこの時間たったセクションを「終わった」とみなし、要約する。 */
export const SECTION_IDLE_MS = 30 * 60_000;
/** 自動で要約するのは、この日数以内に終わったセクションだけ。それより前は開いたときに作る。 */
export const AUTO_SUMMARY_DAYS = 7;

export function isSummarizable(section: {
  start: number;
  end: number;
  promptCount: number;
}): boolean {
  return (
    section.end - section.start >= SUMMARY_MIN_DURATION_MS ||
    section.promptCount >= SUMMARY_MIN_PROMPTS
  );
}
