// Builds the excerpt of a section that is passed to the LLM.
import { TEST_RE } from "./facts.ts";

/** A stored message, reduced to the columns the digest reads. */
export interface DigestMessage {
  kind: string;
  text: string | null;
  tool_name: string | null;
  /** Links a tool call to its result. */
  tool_use_id?: string | null;
  /** 1 when a tool result is an error. */
  is_error?: number;
}

/**
 * Message kinds the digest reads; any other kind adds nothing to it. Finding targets checks for
 * these too, so a section the digest would come out empty for is never picked.
 */
export const DIGEST_KINDS = [
  "prompt",
  "command",
  "sdk_prompt",
  "assistant",
  "tool_use",
  "compact",
] as const;

/** Default cap on the digest length in characters; past it, the middle is dropped. */
export const DIGEST_LIMIT = 60_000;
const PROMPT_CHARS = 2_000;
const REPLY_CHARS = 800;
/** The last reply is where Claude sums up and lists what is left, so it is kept nearly whole. */
const LAST_REPLY_CHARS = 4_000;
const TOOL_CHARS = 160;
const FAILURE_CHARS = 200;
/** Calls whose failure says whether the work got done: tests and checks, git and gh. */
const TELLING_CALL_RE = new RegExp(`${TEST_RE.source}|\\b(?:git|gh) `);

function clip(text: string, limit: number): string {
  const t = text.trim();
  return t.length <= limit ? t : `${t.slice(0, limit)}…`;
}

/** The output's last non-empty line, where errors and test totals usually are. */
function failureLine(text: string | null): string {
  const line =
    (text ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .at(-1) ?? "";
  return clip(line, FAILURE_CHARS);
}

/** Results that failed, by the ID of the call that made them. */
function failedResults(messages: DigestMessage[]): Map<string, DigestMessage> {
  const failed = new Map<string, DigestMessage>();
  for (const m of messages)
    if (m.kind === "tool_result" && m.is_error === 1 && m.tool_use_id) failed.set(m.tool_use_id, m);
  return failed;
}

/**
 * Lists only what shows the work (prompts, replies, tool calls, and failed tests, git and gh calls).
 * If too long, keeps the start and the end.
 */
export function buildDigest(messages: DigestMessage[], limit = DIGEST_LIMIT): string {
  const failed = failedResults(messages);
  const lastReply = messages.findLastIndex((m) => m.kind === "assistant");
  const lines: string[] = [];
  messages.forEach((m, i) => {
    const text = m.text ?? "";
    // The SDK input is what a headless session was asked to do, so it reads as the user's request
    if (m.kind === "prompt" || m.kind === "command" || m.kind === "sdk_prompt")
      lines.push(`\n[User] ${clip(text, PROMPT_CHARS)}`);
    else if (m.kind === "assistant")
      lines.push(`[Claude] ${clip(text, i === lastReply ? LAST_REPLY_CHARS : REPLY_CHARS)}`);
    else if (m.kind === "tool_use") {
      lines.push(`  → ${m.tool_name ?? "tool"}: ${clip(text, TOOL_CHARS)}`);
      const failure = m.tool_use_id ? failed.get(m.tool_use_id) : undefined;
      if (failure && m.tool_name === "Bash" && TELLING_CALL_RE.test(text))
        lines.push(`    ✗ failed: ${failureLine(failure.text)}`);
    } else if (m.kind === "compact") lines.push("— conversation compacted —");
  });
  const all = lines.join("\n").trim();
  if (all.length <= limit) return all;
  // The first request and how things ended matter most
  const head = Math.floor((limit * 2) / 5);
  return `${all.slice(0, head)}\n\n… (omitted) …\n\n${all.slice(all.length - (limit - head))}`;
}
