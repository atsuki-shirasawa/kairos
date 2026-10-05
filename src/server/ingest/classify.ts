import { contentText, list, type Rec, rec, str } from "./records.ts";

export type UserKind =
  | "prompt" // 人が打った文
  | "command" // 人が打ったスラッシュコマンド
  | "scheduled" // /loop・cron が起こしたターンの開始
  | "tool_result"
  | "interrupt"
  | "notification" // バックグラウンドタスク等の完了通知
  | "peer" // 別のエージェント・セッションからのメッセージ
  | "compact_summary"
  | "meta"; // それ以外（スキル本文の展開、コマンド出力、SDK からの入力など）

const INTERRUPT_PREFIX = "[Request interrupted by user";
const COMMAND_NAME_RE = /<command-name>([\s\S]*?)<\/command-name>/;
const COMMAND_ARGS_RE = /<command-args>([\s\S]*?)<\/command-args>/;

/**
 * `type=user` のレコードを分類する。判定ルールの根拠は tests/fixtures/README.md を参照。
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
