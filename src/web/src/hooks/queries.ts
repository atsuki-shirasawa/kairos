import type { OpenItemUpdate, ProjectUpdate, RecapRequest } from "@shared/api.ts";
import { MIN_SEARCH_CHARS } from "@shared/constants.ts";
import { MINUTE } from "@shared/dates.ts";
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
import { keys } from "@/lib/queryKeys.ts";

/** Waits this long after the last keystroke before searching every period. */
const SEARCH_DEBOUNCE_MS = 200;

/** Sessions and projects of the period [from, to), the data every layout draws. */
export function useCalendar(from: number, to: number, enabled = true) {
  return useQuery({
    queryKey: keys.calendar(from, to),
    queryFn: () => api.calendar(from, to),
    enabled,
    placeholderData: keepPreviousData, // Keep the previous week on screen while the next one loads
  });
}

/**
 * Every project, for each page's colors and names (the live page too, which fetches no period).
 */
export function useProjects() {
  return useQuery({ queryKey: keys.projects, queryFn: api.projects });
}

/**
 * How often the live data is refetched with no event: the token band's rate and chart are as of the
 * fetch, so a quiet hour would otherwise keep showing the last busy minutes as "now".
 */
const LIVE_REFRESH_MS = MINUTE;

/**
 * Claude Code sessions running now and the tokens they use. Refetched on live.updated and
 * sessions.updated, and every minute so the token band moves on while nothing happens.
 */
export function useLive() {
  return useQuery({ queryKey: keys.live, queryFn: api.live, refetchInterval: LIVE_REFRESH_MS });
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

/**
 * Work matching the keyword across every period. Idle until the query is long enough, and while
 * not `enabled` (a page without the search field).
 */
export function useSearch(q: string, enabled: boolean) {
  const query = q.trim();
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const result = useQuery({
    queryKey: keys.search(debounced),
    queryFn: () => api.search(debounced),
    enabled: enabled && [...debounced].length >= MIN_SEARCH_CHARS,
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

/** Open items of the period's projects. Fetched only for the summary view. */
export function useOpenItems(from: number, to: number) {
  return useQuery({ queryKey: keys.openItems(from, to), queryFn: () => api.openItems(from, to) });
}

/** Closes an open item by hand (done or won't do), or reopens one closed by hand. */
export function useUpdateOpenItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: number; update: OpenItemUpdate }) =>
      api.updateOpenItem(id, update),
    // Every period's list, the recaps that read the open items (one may turn stale), and the
    // drawer's sections, which list the items they left open
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: keys.allOpenItems }),
        client.invalidateQueries({ queryKey: keys.allRecaps }),
        client.invalidateQueries({ queryKey: keys.allSessions }),
      ]),
  });
}

/** The server's settings (summary language, headless visibility), shared by the hooks below. */
function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: api.settings });
}

/**
 * Keeps the server's summary language in step with the UI language, so summaries and recaps are
 * written in the language on screen. Skipped when the server fixes it with `--summary-lang`.
 */
export function useSummaryLangSync(locale: Locale) {
  const client = useQueryClient();
  const { data } = useSettings();
  useEffect(() => {
    if (!data || data.summaryLangFixed || data.summaryLang === locale) return;
    api
      .updateSettings({ summaryLang: locale })
      .then((s) => client.setQueryData(keys.settings, s))
      // Summaries stay in the old language until the next load; nothing on screen depends on it
      .catch(() => {});
  }, [data, locale, client]);
}

/**
 * Whether headless sessions (claude -p / SDK runs) are shown, and a setter. A server setting, so
 * the calendar, search and navigation all follow it; changing it refetches everything under
 * "calendar". `show` is false until the settings have loaded, which `loaded` tells.
 */
export function useShowHeadless(): [
  show: boolean,
  setShow: (show: boolean) => void,
  loaded: boolean,
] {
  const client = useQueryClient();
  const { data } = useSettings();
  const { mutate } = useMutation({
    mutationFn: (show: boolean) => api.updateSettings({ showHeadless: show }),
    onSuccess: (settings) => {
      client.setQueryData(keys.settings, settings);
      void client.invalidateQueries({ queryKey: keys.allCalendar });
      // The live page lists sessions and counts tokens by the same visibility
      void client.invalidateQueries({ queryKey: keys.live });
    },
  });
  return [data?.showHeadless ?? false, mutate, data !== undefined];
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
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: keys.allCalendar }),
        // The token band leaves hidden projects out on the server
        client.invalidateQueries({ queryKey: keys.live }),
      ]),
  });
}
