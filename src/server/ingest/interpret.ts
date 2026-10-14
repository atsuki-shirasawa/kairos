// How a classified `type=user` record is stored: under which kind, with which text, and how it
// moves the automatic-run turn state. Pure, so the rules can be tested without a DB.
import { commandText, isCommandText, type UserKind } from "./classify.ts";
import { LIMIT } from "./limits.ts";
import { clip, clipEnds, type Rec, rec, str } from "./records.ts";

/** User kinds that are stored at all (meta records never are). */
export type StoredUserKind = Exclude<UserKind, "meta">;

/** User kinds stored as one message row of their own text (tool results are stored per block). */
export type TextUserKind = Exclude<StoredUserKind, "tool_result">;

/**
 * Whether the rows that follow belong to an automatic run's turn (/loop, cron), after a user
 * record of `kind`: a scheduled tick starts one, something the user typed ends it, and anything
 * else leaves it as it was.
 */
export function nextAutoTurn(autoTurn: boolean, kind: UserKind): boolean {
  if (kind === "scheduled") return true;
  if (kind === "prompt" || kind === "command") return false;
  return autoTurn;
}

/**
 * The kind a user record is stored under, or null when it isn't stored. Instructions to a
 * subagent have no origin (and in an SDK session look like SDK input), so they are its prompt.
 * Meta records are never stored, and a compact summary only in the main conversation, where
 * summaries read it.
 */
export function storedUserKind(kind: UserKind, inSubagent: boolean): StoredUserKind | null {
  if (inSubagent && (kind === "meta" || kind === "sdk_prompt")) return "prompt";
  if (kind === "meta") return null;
  if (kind === "compact_summary" && inSubagent) return null;
  return kind;
}

/**
 * The text stored for a user record of `kind`, from the record and its content text: typed
 * prompts and SDK input up to the long limit (a slash command as `/name args`), short notices
 * clipped short, a peer message's body, and a compact summary with both ends kept.
 */
export function storedUserText(kind: TextUserKind, r: Rec, text: string): string {
  switch (kind) {
    case "prompt":
      return clip(text.trim(), LIMIT.text);
    case "command":
      return commandText(text);
    case "sdk_prompt": {
      const trimmed = text.trim();
      return isCommandText(trimmed) ? commandText(trimmed) : clip(trimmed, LIMIT.text);
    }
    case "scheduled":
    case "interrupt":
    case "notification":
      return clip(text.trim(), LIMIT.short);
    case "peer":
      return clip(str(rec(r.origin)?.body) ?? text, LIMIT.short);
    // Claude Code's own account of the work so far, with what is pending, for summaries to read
    case "compact_summary":
      return clipEnds(text.trim(), LIMIT.compactSummary);
  }
}
