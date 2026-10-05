// Claude Code が書く jsonl と同じ形のレコードを組み立てる。
// フィールド名と値の組み合わせは、実ログ約 22 万レコードの調査結果（2026-10-05、Claude Code 2.1.2xx）に合わせている。
// 本文やパスは架空のもので、実ログの内容は含まない。

export type Rec = Record<string, unknown>;

export const VERSION = "2.1.289";
const BASE = Date.UTC(2026, 8, 28, 0, 0, 0); // 2026-09-28T00:00:00Z（JST 09:00）

/** 基準時刻から `minute` 分後の ISO 文字列。 */
export function at(minute: number): string {
  return new Date(BASE + minute * 60_000).toISOString();
}

export class LogBuilder {
  readonly records: Rec[] = [];
  private n = 0;
  private msg = 0;
  private tool = 0;
  private parent: string | null = null;

  constructor(
    readonly sessionId: string,
    public cwd: string,
    public gitBranch = "main",
    private readonly sidechain: { agentId: string } | null = null,
  ) {}

  private uuid(): string {
    this.n += 1;
    return `${this.sessionId.slice(0, 8)}-${this.sidechain?.agentId ?? "main"}-${String(this.n).padStart(4, "0")}`;
  }

  /** 会話の流れに乗るレコード（uuid・parentUuid を持つ）。 */
  private chain(type: string, minute: number, extra: Rec): Rec {
    const uuid = this.uuid();
    const rec: Rec = {
      parentUuid: this.parent,
      isSidechain: this.sidechain !== null,
      ...(this.sidechain ? { agentId: this.sidechain.agentId } : {}),
      type,
      ...extra,
      uuid,
      timestamp: at(minute),
      userType: "external",
      entrypoint: "cli",
      cwd: this.cwd,
      sessionId: this.sessionId,
      version: VERSION,
      gitBranch: this.gitBranch,
    };
    this.parent = uuid;
    this.records.push(rec);
    return rec;
  }

  /** 会話の流れに乗らないメタレコード（ai-title、pr-link など）。 */
  meta(type: string, fields: Rec = {}): Rec {
    const rec: Rec = { type, ...fields, sessionId: this.sessionId };
    this.records.push(rec);
    return rec;
  }

  /** 生のレコードをそのまま足す（別セッションからのコピーなど）。 */
  raw(rec: Rec): Rec {
    this.records.push(rec);
    return rec;
  }

  // ------------------------------------------------------------------ user

  /** 人が打ったプロンプト。`source` は typed / suggestion_accepted / queued / sdk。 */
  prompt(minute: number, text: string, source = "typed"): Rec {
    return this.chain("user", minute, {
      promptId: `p-${this.n + 1}`,
      message: { role: "user", content: text },
      permissionMode: "auto",
      origin: { kind: "human" },
      promptSource: source,
      turnOrigin: "human",
    });
  }

  /** 人が打ったスラッシュコマンド。 */
  command(minute: number, name: string, args = ""): Rec {
    const text = `<command-message>${name.replace(/^\//, "")}</command-message>\n<command-name>${name}</command-name>\n<command-args>${args}</command-args>`;
    return this.chain("user", minute, {
      message: { role: "user", content: text },
      origin: { kind: "human" },
      turnOrigin: "human",
    });
  }

  /** /loop や cron が起こしたターンの最初の user レコード。 */
  scheduledTick(minute: number, text: string, taskId = "e3278fca"): Rec {
    return this.chain("user", minute, {
      message: { role: "user", content: text },
      isMeta: true,
      promptSource: "system",
      turnOrigin: "scheduled",
      scheduledTaskId: taskId,
      scheduledFireId: `fire-${this.n + 1}`,
    });
  }

  /** バックグラウンドのタスクやサブエージェントの完了通知。 */
  taskNotification(minute: number, taskId: string, status: string, summary: string): Rec {
    const text = `<task-notification>\n<task-id>${taskId}</task-id>\n<status>${status}</status>\n<summary>${summary}</summary>\n</task-notification>`;
    return this.chain("user", minute, {
      message: { role: "user", content: text },
      origin: { kind: "task-notification" },
      promptSource: "system",
      turnOrigin: "task_notification",
    });
  }

  /** 別のエージェント・セッションから届いたメッセージ。 */
  peerMessage(minute: number, from: string, body: string): Rec {
    return this.chain("user", minute, {
      message: {
        role: "user",
        content: `Another Claude session sent a message:\n<agent-message from="${from}">\n${body}\n</agent-message>`,
      },
      isMeta: true,
      origin: { kind: "peer", from, body },
      promptSource: "system",
      turnOrigin: "peer",
    });
  }

  /** origin を持たないシステム由来の user レコード（スキル本文の展開、コマンド出力など）。 */
  systemUser(minute: number, content: unknown, extra: Rec = {}): Rec {
    return this.chain("user", minute, { message: { role: "user", content }, ...extra });
  }

  interrupt(minute: number): Rec {
    return this.chain("user", minute, {
      message: { role: "user", content: [{ type: "text", text: "[Request interrupted by user]" }] },
    });
  }

  toolResult(
    minute: number,
    toolUseId: string,
    output: string,
    opts: { isError?: boolean; result?: Rec } = {},
  ): Rec {
    return this.chain("user", minute, {
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: output,
            is_error: opts.isError ?? false,
          },
        ],
      },
      toolUseResult: opts.result ?? {
        stdout: output,
        stderr: "",
        interrupted: false,
        isImage: false,
      },
      sourceToolAssistantUUID: this.parent,
    });
  }

  compactSummary(minute: number, text: string): Rec {
    return this.chain("user", minute, {
      message: { role: "user", content: text },
      isCompactSummary: true,
      isVisibleInTranscriptOnly: true,
    });
  }

  // ------------------------------------------------------------------ assistant

  assistant(
    minute: number,
    content: Rec[],
    opts: { stop?: string | null; model?: string } = {},
  ): Rec {
    this.msg += 1;
    const id = `msg_${this.sessionId.slice(0, 6)}${this.sidechain?.agentId ?? ""}${String(this.msg).padStart(4, "0")}`;
    return this.chain("assistant", minute, {
      requestId: `req_${id}`,
      message: {
        id,
        type: "message",
        role: "assistant",
        model: opts.model ?? "claude-opus-5-5",
        content,
        stop_reason: opts.stop === undefined ? "end_turn" : opts.stop,
        usage: {
          input_tokens: 120,
          output_tokens: 80,
          cache_read_input_tokens: 24_000,
          cache_creation_input_tokens: 600,
        },
      },
      effort: "high",
    });
  }

  text(minute: number, text: string): Rec {
    return this.assistant(minute, [{ type: "text", text }]);
  }

  thinking(minute: number, thought: string): Rec {
    return this.assistant(minute, [{ type: "thinking", thinking: thought, signature: "sig" }], {
      stop: null,
    });
  }

  /** ツール呼び出し。戻り値は tool_use の id。 */
  toolUse(minute: number, name: string, input: Rec): string {
    this.tool += 1;
    const id = `toolu_${this.sessionId.slice(0, 6)}${this.sidechain?.agentId ?? ""}${String(this.tool).padStart(4, "0")}`;
    this.assistant(minute, [{ type: "tool_use", id, name, input }], { stop: "tool_use" });
    return id;
  }

  /** Bash を呼んで結果を返すまでの一往復。 */
  bash(minute: number, command: string, output: string, isError = false): string {
    const id = this.toolUse(minute, "Bash", { command, description: command.slice(0, 40) });
    this.toolResult(minute, id, output, { isError });
    return id;
  }

  // ------------------------------------------------------------------ system

  system(minute: number, subtype: string, fields: Rec = {}): Rec {
    return this.chain("system", minute, { subtype, level: "info", isMeta: false, ...fields });
  }

  turnEnd(minute: number, durationMs = 30_000): Rec {
    return this.system(minute, "turn_duration", { durationMs, pendingBackgroundAgentCount: 0 });
  }

  attachment(minute: number, attachment: Rec): Rec {
    return this.chain("attachment", minute, { attachment });
  }

  toJsonl(): string {
    return `${this.records.map((r) => JSON.stringify(r)).join("\n")}\n`;
  }
}
