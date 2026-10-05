import type { ProjectUpdate } from "@shared/api.ts";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api.ts";

export const keys = {
  calendar: (from: number, to: number) => ["calendar", from, to] as const,
  session: (id: string) => ["session", id] as const,
  messages: (id: string, agent: string | null) => ["messages", id, agent] as const,
};

export function useCalendar(from: number, to: number) {
  return useQuery({
    queryKey: keys.calendar(from, to),
    queryFn: () => api.calendar(from, to),
    placeholderData: keepPreviousData, // 週を移動しても、読み込み中は前の表示を残す
  });
}

export function useSession(id: string | null) {
  return useQuery({
    queryKey: keys.session(id ?? ""),
    queryFn: () => api.session(id ?? ""),
    enabled: id !== null,
  });
}

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

export function useRequestSummary(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (start: number) => api.requestSummary(sessionId, start),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.session(sessionId) }),
  });
}

export function useUpdateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: number; update: ProjectUpdate }) =>
      api.updateProject(id, update),
    onSuccess: () => client.invalidateQueries({ queryKey: ["calendar"] }),
  });
}
