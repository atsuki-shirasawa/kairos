// Small helpers for reading jsonl records type-safely.

export type Rec = Record<string, unknown>;

export function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function rec(v: unknown): Rec | undefined {
  return isRec(v) ? v : undefined;
}

export function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function parseTs(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/** Extracts the text from message.content (a string or an array of blocks). */
export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  return list(content)
    .map((b) => {
      const block = rec(b);
      if (!block) return "";
      if (block.type === "text") return str(block.text) ?? "";
      if (block.type === "image") return "[image]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Turns tool_result content (a string or an array of blocks) into a string. */
export function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  return list(content)
    .map((b) => {
      const block = rec(b);
      if (block?.type === "text") return str(block.text) ?? "";
      if (block?.type === "image") return "[image]";
      if (block?.type === "tool_reference") return `[${str(block.tool_name) ?? "tool"}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Truncates to `limit` characters and notes how much was cut. */
export function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n… (${(text.length - limit).toLocaleString("en-US")} more characters)`;
}
