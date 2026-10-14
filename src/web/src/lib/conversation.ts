// How a conversation's messages become the rows the drawer lists: which ones are shown, where the
// date changes, and the one-line text of system messages.
import type { Message } from "@shared/api.ts";
import { isSameDay } from "./dates.ts";

/** A row of the conversation: a message, or a line marking that the date changed before it. */
export type ConversationRow =
  | {
      type: "day";
      ts: number;
      /** The message the new day starts with, to key the row by. */
      id: string;
    }
  | { type: "message"; message: Message };

/**
 * The messages to list, with a day row before each one whose date differs from the previous
 * dated message's. Entries show only the time, and sessions often run over several days. Tool
 * results aren't rows of their own: they are shown inside their call (see `toolResultsById`).
 */
export function withDaySeparators(messages: readonly Message[]): ConversationRow[] {
  const rows: ConversationRow[] = [];
  let day: number | null = null;
  for (const m of messages) {
    if (m.kind === "tool_result") continue;
    if (m.ts !== null && (day === null || !isSameDay(day, m.ts))) {
      day = m.ts;
      rows.push({ type: "day", ts: m.ts, id: m.id });
    }
    rows.push({ type: "message", message: m });
  }
  return rows;
}

/** Tool results by the id of the call they answer, so each call can show its own. */
export function toolResultsById(messages: readonly Message[]): Map<string, Message> {
  const map = new Map<string, Message>();
  for (const m of messages) if (m.kind === "tool_result" && m.toolUseId) map.set(m.toolUseId, m);
  return map;
}

/** The first line of a system message, without a leading Markdown heading mark. */
export function firstLine(text: string | null): string {
  return (text ?? "").replace(/^#+\s*/, "").split("\n")[0] ?? "";
}

/** A notification's `<summary>`, or its first line when it has none. */
export function notificationSummary(text: string | null): string {
  const summary = /<summary>([\s\S]*?)<\/summary>/.exec(text ?? "")?.[1];
  return summary?.trim() || firstLine(text);
}
