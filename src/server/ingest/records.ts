// jsonl レコードを型安全に読むための小さなヘルパー。

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

/** message.content（文字列 or ブロック配列）から本文テキストを取り出す。 */
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

/** tool_result の content（文字列 or ブロック配列）を文字列にする。 */
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

/** `limit` 文字で切り詰め、切った量を書き添える。 */
export function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n… (${(text.length - limit).toLocaleString("en-US")} more characters)`;
}
