import { contentText, list, type Rec, rec, str } from "./records.ts";

export type UserKind =
  | "prompt" // Text typed by the user
  | "command" // Slash command typed by the user
  | "scheduled" // Start of a turn triggered by /loop or cron
  | "tool_result"
  | "interrupt"
  | "notification" // Completion notice from a background task etc.
  | "peer" // Message from another agent or session
  | "compact_summary"
  | "meta"; // Anything else (expanded skill text, command output, input from the SDK, etc.)

const INTERRUPT_PREFIX = "[Request interrupted by user";
const COMMAND_NAME_RE = /<command-name>([\s\S]*?)<\/command-name>/;
const COMMAND_ARGS_RE = /<command-args>([\s\S]*?)<\/command-args>/;

/**
 * Classifies `type=user` records. See tests/fixtures/README.md for the reasoning behind the rules.
 */
export function classifyUser(r: Rec): UserKind {
  const content = rec(r.message)?.content;
  if (r.toolUseResult !== undefined || list(content).some((b) => rec(b)?.type === "tool_result")) {
    return "tool_result";
  }
  if (r.isCompactSummary) return "compact_summary";
  const text = contentText(content).trimStart();
  if (text.startsWith(INTERRUPT_PREFIX)) return "interrupt";
  if (r.turnOrigin === "scheduled") return "scheduled";

  const kind = str(rec(r.origin)?.kind);
  if (kind === "task-notification" || text.startsWith("<task-notification>")) return "notification";
  if (kind === "peer") return "peer";
  if (kind !== "human" || r.isMeta) return "meta";
  if (text.startsWith("<command-message>") || text.startsWith("<command-name>")) return "command";
  if (text.startsWith("<")) return "meta";
  return "prompt";
}

/** `<command-name>/loop</command-name><command-args>30m</command-args>` → `/loop 30m` */
export function commandText(text: string): string {
  const name = COMMAND_NAME_RE.exec(text)?.[1]?.trim() || "/command";
  const args = COMMAND_ARGS_RE.exec(text)?.[1]?.trim();
  return args ? `${name} ${args}` : name;
}
