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

/** カレンダーに描く 1 ブロック（セクション）。 */
export interface CalendarSegment {
  start: number;
  end: number;
  /** AI 要約の見出し。なければ最初の発言（または Claude の最後の返答）の 1 行目。 */
  headline: string;
  summarized: boolean;
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
