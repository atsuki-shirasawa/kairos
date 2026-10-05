// セクション要約のプロンプトと、出力の読み取り。

export interface PromptInput {
  sessionTitle: string;
  projectName: string | null;
  /** 同じセッションの、このセクションより前のセクションの見出し。 */
  previous: string[];
  digest: string;
}

function contextOf(input: PromptInput): string {
  return [
    `セッション名: ${input.sessionTitle}`,
    input.projectName ? `プロジェクト: ${input.projectName}` : null,
    input.previous.length
      ? `このセッションのそれまでの作業:\n${input.previous.map((h) => `- ${h}`).join("\n")}`
      : "このセッションの最初の作業です。",
  ]
    .filter(Boolean)
    .join("\n");
}

const HEADLINE_RULE = "15〜35 字、体言止め、記号や引用符なし";

export function buildPrompt(input: PromptInput): string {
  return `以下は Claude Code のセッションのうち、ひと続きの作業時間（セクション）のやり取りの抜粋です。
後からカレンダーで「この時間に何をしていたか」を振り返るための要約を、日本語で書いてください。

出力形式（Markdown。前置きや締めの文は書かない）:
1 行目: この時間の作業を表す見出し（${HEADLINE_RULE}）
空行
- 目的: …
- やったこと: …（主な作業を 1〜3 点）
- 結果: …（終わったこと、コミットや PR、残った課題）

<context>
${contextOf(input)}
</context>

<transcript>
${input.digest}
</transcript>
`;
}

/**
 * 短いセクション（要約の対象外）の見出しだけを作るプロンプト。
 * 最初の発言をそのまま出すと「お願いします」のような見出しになるため、内容から付け直す。
 */
export function buildTitlePrompt(input: PromptInput): string {
  return `以下は Claude Code のセッションのうち、短い作業時間（セクション）のやり取りです。
後からカレンダーで振り返るときの見出しを、日本語で 1 行だけ書いてください（${HEADLINE_RULE}）。
見出しの他には何も書かない。

<context>
${contextOf(input)}
</context>

<transcript>
${input.digest}
</transcript>
`;
}

export interface ParsedSummary {
  headline: string;
  body: string;
}

/** 1 行目を見出し、残りを本文として読む。見出しの飾り（# や引用符）は外す。 */
export function parseSummary(output: string): ParsedSummary | null {
  const lines = output.trim().split("\n");
  const first = lines.findIndex((l) => l.trim());
  if (first === -1) return null;
  const headline = (lines[first] ?? "")
    .replace(/^#+\s*/, "")
    .replace(/^見出し[:：]\s*/, "")
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
