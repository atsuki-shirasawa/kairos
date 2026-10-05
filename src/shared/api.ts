// サーバーとフロントで共有する API の型。時刻はすべて Unix エポックからのミリ秒。

export interface HealthResponse {
  ok: true;
  name: "kairos";
  version: string;
}

export interface Project {
  id: number;
  /** プロジェクトを表すパス（worktree は親リポジトリにまとめてある）。 */
  path: string;
  /** git の remote があればリポジトリ名、なければディレクトリ名。 */
  name: string;
  /** remote から取った `host/owner/repo`。同じ値のディレクトリは 1 つのプロジェクトにまとめてある。 */
  repo: string | null;
  /** パレットのキー（`p0`〜`p7`）。未設定ならフロントが ID から割り当てる。 */
  color: string | null;
  hidden: boolean;
}

export interface ProjectUpdate {
  color?: string | null;
  hidden?: boolean;
}

/** トークン使用量。サブエージェントの分も含む。 */
export interface Usage {
  /** 入力・出力・キャッシュの読み書きの合計。 */
  tokens: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** API の料金表で換算した額（米ドル）。サブスクリプションでの実際の支払いとは一致しない目安。 */
  costUsd: number;
  /** 料金の分からないモデルの分があり、costUsd に含めていない。 */
  unpriced: boolean;
  /** 出力トークンがいちばん多いモデル。 */
  model: string | null;
}

/** 作業ブロックの中でしたこと。サブエージェントの分も含む。 */
export interface Activity {
  commits: number;
  prs: number;
  /** Edit / Write などで書き換えたファイルの数（同じファイルは 1 つ）。 */
  filesEdited: number;
  toolCalls: number;
  /** 起動したサブエージェントの数。 */
  subagents: number;
  /** 失敗したツール呼び出し。 */
  toolErrors: number;
  /** 人が止めた回数。 */
  interrupts: number;
  /** API のエラー（混雑・上限など）。 */
  apiErrors: number;
  /** 会話の圧縮（compaction）の回数。 */
  compactions: number;
  /** Claude がターンを進めていた時間の合計（ミリ秒）。記録のない古い版のログでは null。 */
  claudeMs: number | null;
  /** 出力トークンがいちばん多い effort。 */
  effort: string | null;
}

/** カレンダーに描く 1 ブロック（セクション）。 */
export interface CalendarSegment {
  start: number;
  end: number;
  /** AI 要約の見出し。なければ最初の発言（または Claude の最後の返答）の 1 行目。 */
  headline: string;
  summarized: boolean;
  /** 人の発言（プロンプトとスラッシュコマンド）の数。 */
  promptCount: number;
  /** この時間内のトークン使用量。記録がなければ null。 */
  usage: Usage | null;
  activity: Activity;
}

/** カレンダーに描く 1 セッション。 */
export interface CalendarSession {
  id: string;
  projectId: number | null;
  /** worktree 名などの補助ラベル。 */
  label: string | null;
  title: string;
  startedAt: number;
  endedAt: number;
  promptCount: number;
  /** 最後の活動から間もない（作業中の可能性が高い）。 */
  active: boolean;
  segments: CalendarSegment[];
}

export interface CalendarResponse {
  from: number;
  to: number;
  sessions: CalendarSession[];
  projects: Project[];
  /** 期間より前の、いちばん近い作業ブロックの開始。空の期間から移動できるようにする。 */
  prev: number | null;
  /** 期間より後の、いちばん近い作業ブロックの開始。 */
  next: number | null;
}

/** 作業ブロックの時刻だけ。日付ピッカーで「記録のある日」に印を付けるのに使う。 */
export interface Span {
  start: number;
  end: number;
  projectId: number | null;
}

/**
 * 期間と重なる作業ブロックの時刻（人の発言があるセッションのもの）。
 * 日への振り分けは画面のローカル時刻で行うので、サーバーは日にまとめずに返す。
 */
export interface SpansResponse {
  spans: Span[];
}

export interface Artifact {
  kind: "commit" | "pr";
  /** コミットなら SHA、PR なら URL。 */
  ref: string;
  title: string | null;
  ts: number | null;
}

export interface Subagent {
  id: string;
  agentType: string | null;
  description: string | null;
  toolUseId: string | null;
  /** 会話の最初と最後の時刻。 */
  startedAt: number | null;
  endedAt: number | null;
}

/** セッションの中の 1 セクション（カレンダーの 1 ブロック）。 */
export interface Section {
  start: number;
  end: number;
  promptCount: number;
  /** AI 要約の見出し。なければ最初の発言（または Claude の最後の返答）の 1 行目。 */
  headline: string;
  /** AI 要約の本文（Markdown）。未生成なら null。 */
  body: string | null;
  model: string | null;
  createdAt: number | null;
  /** 要約の後にセクションが続いている。 */
  stale: boolean;
  /** LLM で要約する対象か（短いセクションは対象外）。 */
  summarizable: boolean;
  /** 要約を作っている最中。 */
  pending: boolean;
  /** 直近の要約に失敗した理由。 */
  error: string | null;
  /** この時間内のトークン使用量。記録がなければ null。 */
  usage: Usage | null;
  activity: Activity;
}

export interface SessionDetail {
  id: string;
  project: Project | null;
  launchCwd: string | null;
  label: string | null;
  branch: string | null;
  title: string;
  /** 時刻順のセクション。 */
  sections: Section[];
  /** Claude Code が書いた振り返り文。AI 要約ができるまでの仮表示に使う。 */
  awaySummary: string | null;
  startedAt: number | null;
  endedAt: number | null;
  active: boolean;
  promptCount: number;
  scheduledRuns: number;
  continuedFrom: string | null;
  continuedIn: string | null;
  commits: Artifact[];
  prs: Artifact[];
  subagents: Subagent[];
  /** セッション全体のトークン使用量（作業ブロックの外の自動実行も含む）。 */
  usage: Usage | null;
}

export type MessageKind =
  | "prompt"
  | "command"
  | "assistant"
  | "tool_use"
  | "tool_result"
  | "scheduled"
  | "interrupt"
  | "notification"
  | "peer"
  | "compact"
  | "error";

export interface Message {
  id: string;
  ts: number | null;
  kind: MessageKind;
  text: string | null;
  toolName: string | null;
  toolUseId: string | null;
  /** tool_use の入力（JSON）、compact のメタ情報（JSON）。 */
  detail: string | null;
  isError: boolean;
  isScheduled: boolean;
  /** 続きのセッションにある、前のセッションの会話のコピー。 */
  isCopy: boolean;
}

export interface MessagesResponse {
  messages: Message[];
  /** 続きを取るときに `cursor` に渡す値。最後まで取り終えたら null。 */
  nextCursor: string | null;
}

/** `/api/events`（Server-Sent Events）で届くイベント。 */
export type ServerEvent =
  | { type: "sessions.updated"; ids: string[] }
  | { type: "summary.updated"; sessionId: string; start: number }
  | { type: "ingest.progress"; done: number; total: number };
