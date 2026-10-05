// Builds records shaped like the jsonl Claude Code writes.
// Field names and value combinations follow a survey of about 220k real records (2026-10-05, Claude Code 2.1.2xx).
// Text and paths are fictional; nothing from real logs is included.

export type Rec = Record<string, unknown>;

export const VERSION = "2.1.289";
const BASE = Date.UTC(2026, 8, 28, 0, 0, 0); // 2026-09-28T00:00:00Z（JST 09:00）

/** ISO string `minute` minutes after the base time. */
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

  /** A record in the conversation chain (has uuid and parentUuid). */
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

  /** A meta record outside the conversation chain (ai-title, pr-link, etc.). */
  meta(type: string, fields: Rec = {}): Rec {
    const rec: Rec = { type, ...fields, sessionId: this.sessionId };
    this.records.push(rec);
    return rec;
  }

  /** Appends a raw record as is (e.g. a copy from another session). */
  raw(rec: Rec): Rec {
    this.records.push(rec);
    return rec;
  }

  // ------------------------------------------------------------------ user

  /** A prompt typed by the user. `source` is typed / suggestion_accepted / queued / sdk. */
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

  /** A slash command typed by the user. */
  command(minute: number, name: string, args = ""): Rec {
    const text = `<command-message>${name.replace(/^\//, "")}</command-message>\n<command-name>${name}</command-name>\n<command-args>${args}</command-args>`;
    return this.chain("user", minute, {
      message: { role: "user", content: text },
      origin: { kind: "human" },
      turnOrigin: "human",
    });
  }

  /** The first user record of a turn triggered by /loop or cron. */
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

  /** Completion notice from a background task or subagent. */
  taskNotification(minute: number, taskId: string, status: string, summary: string): Rec {
    const text = `<task-notification>\n<task-id>${taskId}</task-id>\n<status>${status}</status>\n<summary>${summary}</summary>\n</task-notification>`;
    return this.chain("user", minute, {
      message: { role: "user", content: text },
      origin: { kind: "task-notification" },
      promptSource: "system",
      turnOrigin: "task_notification",
    });
  }

  /** A message from another agent or session. */
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

  /** A system-originated user record without an origin (expanded skill text, command output, etc.). */
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

  /**
   * Writes one response split into a record per block, as in real logs. Every record has the same message.id
   * and input/cache amounts; only output_tokens grows as it is written (the last record holds the final value).
   */
  response(
    minute: number,
    blocks: Rec[],
    usage: { input: number; output: number; cacheRead: number; cache5m: number; cache1h: number },
    opts: { model?: string; speed?: string; effort?: string } = {},
  ): Rec[] {
    this.msg += 1;
    const id = `msg_${this.sessionId.slice(0, 6)}${this.sidechain?.agentId ?? ""}${String(this.msg).padStart(4, "0")}`;
    return blocks.map((block, i) => {
      const last = i === blocks.length - 1;
      return this.chain("assistant", minute, {
        requestId: `req_${id}`,
        message: {
          id,
          type: "message",
          role: "assistant",
          model: opts.model ?? "claude-opus-5-5",
          content: [block],
          stop_reason: last ? "end_turn" : null,
          usage: {
            input_tokens: usage.input,
            cache_creation_input_tokens: usage.cache5m + usage.cache1h,
            cache_read_input_tokens: usage.cacheRead,
            output_tokens: last
              ? usage.output
              : Math.ceil((usage.output * (i + 1)) / blocks.length / 2),
            server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
            service_tier: "standard",
            cache_creation: {
              ephemeral_1h_input_tokens: usage.cache1h,
              ephemeral_5m_input_tokens: usage.cache5m,
            },
            inference_geo: "global",
            speed: opts.speed ?? "standard",
          },
        },
        effort: opts.effort ?? "high",
      });
    });
  }

  /** Synthetic reply Claude Code writes in place of an API error (model `<synthetic>`, all usage 0). */
  apiError(minute: number, text: string): Rec {
    return this.chain("assistant", minute, {
      message: {
        id: `synthetic-${this.n + 1}`,
        type: "message",
        role: "assistant",
        model: "<synthetic>",
        content: [{ type: "text", text }],
        stop_reason: "stop_sequence",
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
      isApiErrorMessage: true,
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

  /** A tool call. Returns the tool_use id. */
  toolUse(minute: number, name: string, input: Rec): string {
    this.tool += 1;
    const id = `toolu_${this.sessionId.slice(0, 6)}${this.sidechain?.agentId ?? ""}${String(this.tool).padStart(4, "0")}`;
    this.assistant(minute, [{ type: "tool_use", id, name, input }], { stop: "tool_use" });
    return id;
  }

  /** One round trip of calling Bash and returning its result. */
  bash(minute: number, command: string, output: string, isError = false): string {
    const id = this.toolUse(minute, "Bash", { command, description: command.slice(0, 40) });
    this.toolResult(minute, id, output, { isError });
    return id;
  }

  /**
   * One `gh pr create` round trip plus a `pr-link` record. The result's `toolUseResult.gitOperation.pr`
   * holds the created PR's number and URL (not its title). `pr-link` may come before or after the result.
   */
  ghPrCreate(
    minute: number,
    command: string,
    pr: { number: number; repository: string },
    opts: { linkFirst?: boolean } = {},
  ): string {
    const url = `https://github.com/${pr.repository}/pull/${pr.number}`;
    const link = () =>
      this.meta("pr-link", {
        prNumber: pr.number,
        prUrl: url,
        prRepository: pr.repository,
        timestamp: at(minute),
      });
    const id = this.toolUse(minute, "Bash", { command, description: "Create pull request" });
    if (opts.linkFirst) link();
    this.toolResult(minute, id, url, {
      result: {
        stdout: url,
        stderr: "",
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
        gitOperation: { pr: { action: "created", number: pr.number, url } },
      },
    });
    if (!opts.linkFirst) link();
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
