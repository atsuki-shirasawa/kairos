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
  name: string;
  /** `#rrggbb`。未設定ならフロントが既定の色を割り当てる。 */
  color: string | null;
  hidden: boolean;
}

export interface ProjectUpdate {
  color?: string | null;
  hidden?: boolean;
}

export type Segment = [start: number, end: number];

/** カレンダーに描く 1 セッション。 */
export interface CalendarSession {
  id: string;
  projectId: number | null;
  /** worktree 名などの補助ラベル。 */
  label: string | null;
  title: string;
  /** AI 要約の見出し。未生成なら null。 */
  headline: string | null;
  startedAt: number;
  endedAt: number;
  promptCount: number;
  /** 最後の活動から間もない（作業中の可能性が高い）。 */
  active: boolean;
  segments: Segment[];
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
}

export interface Summary {
  headline: string;
  body: string;
  model: string;
  coveredUntil: number | null;
  createdAt: number;
  /** 要約の後にセッションが続いている。 */
  stale: boolean;
}

export interface SessionDetail {
  id: string;
  project: Project | null;
  launchCwd: string | null;
  label: string | null;
  branch: string | null;
  title: string;
  summary: Summary | null;
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
  | { type: "ingest.progress"; done: number; total: number };
