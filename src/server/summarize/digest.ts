// LLM に渡すセクションの抜粋を作る。

export interface DigestMessage {
  kind: string;
  text: string | null;
  tool_name: string | null;
}

export const DIGEST_LIMIT = 60_000;
const PROMPT_CHARS = 2_000;
const REPLY_CHARS = 800;
const TOOL_CHARS = 160;

function clip(text: string, limit: number): string {
  const t = text.trim();
  return t.length <= limit ? t : `${t.slice(0, limit)}…`;
}

/** 何をしたかが分かる部分（依頼・返答・ツール呼び出し）だけを並べる。長すぎれば先頭と末尾を残す。 */
export function buildDigest(messages: DigestMessage[], limit = DIGEST_LIMIT): string {
  const lines: string[] = [];
  for (const m of messages) {
    const text = m.text ?? "";
    if (m.kind === "prompt" || m.kind === "command")
      lines.push(`\n[ユーザー] ${clip(text, PROMPT_CHARS)}`);
    else if (m.kind === "assistant") lines.push(`[Claude] ${clip(text, REPLY_CHARS)}`);
    else if (m.kind === "tool_use")
      lines.push(`  → ${m.tool_name ?? "tool"}: ${clip(text, TOOL_CHARS)}`);
    else if (m.kind === "compact") lines.push("— 会話を圧縮 —");
  }
  const all = lines.join("\n").trim();
  if (all.length <= limit) return all;
  // 最初の依頼と、最後にどうなったかを優先する
  const head = Math.floor((limit * 2) / 5);
  return `${all.slice(0, head)}\n\n…（中略）…\n\n${all.slice(all.length - (limit - head))}`;
}
