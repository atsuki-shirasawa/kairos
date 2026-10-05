// サーバー API の型付きクライアント。型は src/shared/api.ts をサーバーと共有する。
import type {
  CalendarResponse,
  HealthResponse,
  MessagesResponse,
  Project,
  ProjectUpdate,
  ServerEvent,
  SessionDetail,
  SpansResponse,
} from "@shared/api.ts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

const query = (params: Record<string, string | number | boolean | null | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== null && v !== undefined && v !== false) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
};

export const api = {
  health: () => request<HealthResponse>("/api/health"),

  calendar: (from: number, to: number) =>
    request<CalendarResponse>(`/api/calendar${query({ from, to })}`),

  spans: (from: number, to: number) => request<SpansResponse>(`/api/spans${query({ from, to })}`),

  projects: () => request<Project[]>("/api/projects"),

  updateProject: (id: number, update: ProjectUpdate) =>
    request<Project>(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    }),

  session: (id: string) => request<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`),

  requestSummary: (id: string, start: number) =>
    request<{ queued: true }>(`/api/sessions/${encodeURIComponent(id)}/sections/${start}/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),

  messages: (
    id: string,
    opts: { agent?: string; cursor?: string | null; limit?: number; copies?: boolean } = {},
  ) =>
    request<MessagesResponse>(
      `/api/sessions/${encodeURIComponent(id)}/messages${query({
        agent: opts.agent,
        cursor: opts.cursor,
        limit: opts.limit,
        copies: opts.copies ? 1 : null,
      })}`,
    ),
};

/** サーバーからのイベントを購読する。切断時はブラウザが自動で再接続する。戻り値で購読をやめる。 */
export function subscribe(onEvent: (event: ServerEvent) => void): () => void {
  const source = new EventSource("/api/events");
  const handler = (e: MessageEvent<string>) => onEvent(JSON.parse(e.data) as ServerEvent);
  const types: ServerEvent["type"][] = ["sessions.updated", "summary.updated", "ingest.progress"];
  for (const t of types) source.addEventListener(t, handler);
  return () => source.close();
}
