import type { ProjectUpdate, RecapRequest } from "@shared/api.ts";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/index.ts";
import { api } from "@/lib/api.ts";

/** Waits this long after the last keystroke before searching every period. */
const SEARCH_DEBOUNCE_MS = 200;
/** The server ignores shorter queries (`MIN_QUERY_CHARS` in the API). */
export const MIN_SEARCH_CHARS = 2;

/** React Query keys. Everything nested under "calendar" is refetched when sessions change. */
export const keys = {
  calendar: (from: number, to: number) => ["calendar", from, to] as const,
  // Nested under "calendar" so import notifications refetch it along with the calendar
  spans: (from: number, to: number) => ["calendar", "spans", from, to] as const,
  session: (id: string) => ["session", id] as const,
  messages: (id: string, agent: string | null) => ["messages", id, agent] as const,
  // Nested under "calendar" so new sessions and summaries refresh the results too
  search: (q: string) => ["calendar", "search", q] as const,
  settings: ["settings"] as const,
  // Nested under "calendar" so new work marks recaps stale, and recap.updated refreshes them
  recaps: (from: number, to: number) => ["calendar", "recaps", from, to] as const,
};

/** Sessions and projects of the period [from, to), the data every layout draws. */
export function useCalendar(from: number, to: number, enabled = true) {
  return useQuery({
    queryKey: keys.calendar(from, to),
    queryFn: () => api.calendar(from, to),
    enabled,
    placeholderData: keepPreviousData, // Keep the previous week on screen while the next one loads
  });
}

/** "Days with sessions" for the date picker. Fetched only while it is open. */
export function useSpans(from: number, to: number, enabled: boolean) {
  return useQuery({
    queryKey: keys.spans(from, to),
    queryFn: () => api.spans(from, to),
    enabled,
    placeholderData: keepPreviousData, // Keep the previous month's dots while moving between months
  });
}

/** Work matching the keyword across every period. Idle until the query is long enough. */
export function useSearch(q: string) {
  const query = q.trim();
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const result = useQuery({
    queryKey: keys.search(debounced),
    queryFn: () => api.search(debounced),
    enabled: [...debounced].length >= MIN_SEARCH_CHARS,
    placeholderData: keepPreviousData, // Keep the list steady while typing
  });
  // Results for an earlier query (while typing or debouncing) must not filter the calendar
  const current = debounced === query && !result.isPlaceholderData;
  return { ...result, current };
}

/** Recaps of the period's projects. Fetched only for the summary view. */
export function useRecaps(from: number, to: number, enabled: boolean) {
  return useQuery({
    queryKey: keys.recaps(from, to),
    queryFn: () => api.recaps(from, to),
    enabled,
  });
}

/** Asks the server to (re)write a project's recap for a period. Runs in the background. */
export function useRequestRecap() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (target: RecapRequest) => api.requestRecap(target),
    // Refetch so the recap shows as being written right away
    onSuccess: (_, t) => client.invalidateQueries({ queryKey: keys.recaps(t.from, t.to) }),
  });
}

/**
 * Keeps the server's summary language in step with the UI language, so summaries and recaps are
 * written in the language on screen. Skipped when the server fixes it with `--summary-lang`.
 */
export function useSummaryLangSync(locale: Locale) {
  const client = useQueryClient();
  const { data } = useQuery({ queryKey: keys.settings, queryFn: api.settings });
  useEffect(() => {
    if (!data || data.summaryLangFixed || data.summaryLang === locale) return;
    api
      .updateSettings({ summaryLang: locale })
      .then((s) => client.setQueryData(keys.settings, s))
      // Summaries stay in the old language until the next load; nothing on screen depends on it
      .catch(() => {});
  }, [data, locale, client]);
}

/** One session's details for the drawer. Idle while no session is open (`id` is null). */
export function useSession(id: string | null) {
  return useQuery({
    queryKey: keys.session(id ?? ""),
    queryFn: () => api.session(id ?? ""),
    enabled: id !== null,
  });
}

/** A session's conversation (or one subagent's when `agent` is set), paged 100 at a time. */
export function useMessages(id: string | null, agent: string | null) {
  return useInfiniteQuery({
    queryKey: keys.messages(id ?? "", agent),
    queryFn: ({ pageParam }) =>
      api.messages(id ?? "", { cursor: pageParam, limit: 100, ...(agent ? { agent } : {}) }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: id !== null,
  });
}

/** Asks the server to (re)summarize the section starting at the given time (epoch ms). */
export function useRequestSummary(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (start: number) => api.requestSummary(sessionId, start),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.session(sessionId) }),
  });
}

/** Saves a project's settings (color, hidden) and refetches everything that shows projects. */
export function useUpdateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: number; update: ProjectUpdate }) =>
      api.updateProject(id, update),
    onSuccess: () => client.invalidateQueries({ queryKey: ["calendar"] }),
  });
}
