// Builds the excerpt of a section that is passed to the LLM.

/** A stored message, reduced to the columns the digest reads. */
export interface DigestMessage {
  kind: string;
  text: string | null;
  tool_name: string | null;
}

/** Default cap on the digest length in characters; past it, the middle is dropped. */
export const DIGEST_LIMIT = 60_000;
const PROMPT_CHARS = 2_000;
const REPLY_CHARS = 800;
const TOOL_CHARS = 160;

function clip(text: string, limit: number): string {
  const t = text.trim();
  return t.length <= limit ? t : `${t.slice(0, limit)}…`;
}

/** Lists only what shows the work (prompts, replies, tool calls). If too long, keeps the start and the end. */
export function buildDigest(messages: DigestMessage[], limit = DIGEST_LIMIT): string {
  const lines: string[] = [];
  for (const m of messages) {
    const text = m.text ?? "";
    if (m.kind === "prompt" || m.kind === "command")
      lines.push(`\n[User] ${clip(text, PROMPT_CHARS)}`);
    else if (m.kind === "assistant") lines.push(`[Claude] ${clip(text, REPLY_CHARS)}`);
    else if (m.kind === "tool_use")
      lines.push(`  → ${m.tool_name ?? "tool"}: ${clip(text, TOOL_CHARS)}`);
    else if (m.kind === "compact") lines.push("— conversation compacted —");
  }
  const all = lines.join("\n").trim();
  if (all.length <= limit) return all;
  // The first request and how things ended matter most
  const head = Math.floor((limit * 2) / 5);
  return `${all.slice(0, head)}\n\n… (omitted) …\n\n${all.slice(all.length - (limit - head))}`;
}
