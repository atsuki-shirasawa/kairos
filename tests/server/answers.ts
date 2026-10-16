// Stub answers for the summarizer, as `claude -p --output-format json` writes them. Most tests keep
// their replies as the Markdown a summary body is stored in, which reads more easily than JSON;
// `markdownRunner` turns each into the structured answer the schema asks for.
import type { Runner, RunStats } from "../../src/server/summarize/claude.ts";
import { TITLE_SCHEMA } from "../../src/server/summarize/output.ts";
import { parseSummaryBody } from "../../src/shared/summaryBody.ts";

/** What a stub run reports it cost, unless a test says otherwise. */
export const STUB_STATS: RunStats = {
  inputTokens: 1200,
  outputTokens: 80,
  costUsd: 0.002,
  latencyMs: 1500,
};

/** The envelope a schema-following run writes around its answer. */
export function envelope(answer: unknown, stats: RunStats = STUB_STATS): string {
  return JSON.stringify({
    type: "result",
    is_error: false,
    result: JSON.stringify(answer),
    structured_output: answer,
    total_cost_usd: stats.costUsd,
    duration_ms: stats.latencyMs,
    usage: {
      input_tokens: stats.inputTokens - 1000,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 0,
      output_tokens: stats.outputTokens,
    },
  });
}

/** "- Closed:" and the "[O1] note" lines under it, which the stored body never holds. */
function closuresOf(lines: string[]): { label: string; evidence: string }[] {
  const at = lines.findIndex((l) => /^- Closed:/.test(l));
  if (at === -1) return [];
  return lines
    .slice(at + 1)
    .map((l) => /^\s+- \[(O\d+)\]\s*(.*)$/.exec(l))
    .filter((m) => m !== null)
    .map((m) => ({ label: m[1] ?? "", evidence: m[2] ?? "" }));
}

/**
 * A reply written as "headline, blank line, Markdown body" turned into the structured answer for
 * the schema: a headline and short title alone for the title schema, every field otherwise.
 */
export function answerOf(markdown: string, schema: object): unknown {
  const [first = "", ...rest] = markdown.trim().split("\n");
  const headline = first.replace(/^#+\s+/, "").trim();
  if (schema === TITLE_SCHEMA) return { headline, short: "" };
  const closedAt = rest.findIndex((l) => /^- Closed:/.test(l));
  const body = (closedAt === -1 ? rest : rest.slice(0, closedAt)).join("\n");
  const parts = parseSummaryBody(body);
  return {
    headline,
    short: "",
    goal: parts?.goal ?? "",
    done: parts?.done ?? [],
    resolved: (parts?.resolved ?? []).map((text) => ({ text, evidence: "" })),
    open: parts?.open ?? [],
    ...(parts?.next ? { next: parts.next } : {}),
    closed: closuresOf(rest),
  };
}

/**
 * A runner over a stub that replies in Markdown: a schema-following run gets the reply as an
 * envelope, and a plain one (a recap) gets the text as it is.
 */
export function markdownRunner(reply: (prompt: string) => Promise<string>): Runner {
  return async (prompt, schema) => {
    const text = await reply(prompt);
    return schema ? envelope(answerOf(text, schema)) : text;
  };
}
