// Typed client for the server API. Types are shared with the server in src/shared/api.ts.
import type {
  CalendarResponse,
  HealthResponse,
  LedgerEntry,
  LiveResponse,
  MessagesResponse,
  OpenItemsResponse,
  OpenItemUpdate,
  Project,
  ProjectUpdate,
  RecapRequest,
  RecapsResponse,
  SearchResponse,
  ServerEvent,
  SessionDetail,
  Settings,
  SettingsUpdate,
  SpansResponse,
} from "@shared/api.ts";

/** A non-2xx API response. `message` is the server's `error` field when it sent one. */
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

/**
 * The request options for sending `body` as JSON. The server's write guard accepts only JSON
 * bodies, so every write goes through here, even one with nothing to send.
 */
function sendJson(method: "POST" | "PATCH", body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

const query = (params: Record<string, string | number | boolean | null | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== null && v !== undefined && v !== false) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
};

/** One method per server endpoint. Throws `ApiError` on a non-2xx response. */
export const api = {
  health: () => request<HealthResponse>("/api/health"),

  calendar: (from: number, to: number) =>
    request<CalendarResponse>(`/api/calendar${query({ from, to })}`),

  live: () => request<LiveResponse>("/api/live"),

  spans: (from: number, to: number) => request<SpansResponse>(`/api/spans${query({ from, to })}`),

  search: (q: string) => request<SearchResponse>(`/api/search${query({ q })}`),

  projects: () => request<Project[]>("/api/projects"),

  settings: () => request<Settings>("/api/settings"),

  updateSettings: (update: SettingsUpdate) =>
    request<Settings>("/api/settings", sendJson("PATCH", update)),

  updateProject: (id: number, update: ProjectUpdate) =>
    request<Project>(`/api/projects/${id}`, sendJson("PATCH", update)),

  session: (id: string) => request<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`),

  requestSummary: (id: string, start: number) =>
    request<{ queued: true }>(
      `/api/sessions/${encodeURIComponent(id)}/sections/${start}/summary`,
      sendJson("POST", {}),
    ),

  recaps: (from: number, to: number) =>
    request<RecapsResponse>(`/api/recaps${query({ from, to })}`),

  requestRecap: (target: RecapRequest) =>
    request<{ queued: true }>("/api/recaps", sendJson("POST", target)),

  openItems: (from: number, to: number) =>
    request<OpenItemsResponse>(`/api/open-items${query({ from, to })}`),

  updateOpenItem: (id: number, update: OpenItemUpdate) =>
    request<LedgerEntry>(`/api/open-items/${id}`, sendJson("PATCH", update)),

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

/** Subscribes to server events. The browser reconnects on its own. Call the result to unsubscribe. */
export function subscribe(onEvent: (event: ServerEvent) => void): () => void {
  const source = new EventSource("/api/events");
  const handler = (e: MessageEvent<string>) => onEvent(JSON.parse(e.data) as ServerEvent);
  // EventSource drops named events nobody listens for, so every type needs a listener; the
  // record makes a new event type a type error here until it is added
  const types = {
    "sessions.updated": true,
    "summary.updated": true,
    "recap.updated": true,
    "ingest.progress": true,
    "live.updated": true,
  } satisfies Record<ServerEvent["type"], true>;
  for (const t of Object.keys(types)) source.addEventListener(t, handler);
  return () => source.close();
}
