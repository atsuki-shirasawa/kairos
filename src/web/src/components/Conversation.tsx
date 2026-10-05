import type { Message } from "@shared/api.ts";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useMessages } from "@/hooks/queries.ts";
import { conversationMessages } from "@/i18n/messages/conversation.ts";
import { hhmm } from "@/lib/dates.ts";
import { cn } from "@/lib/utils.ts";
import { Markdown } from "./Markdown.tsx";

/**
 * The conversation of a session (or a subagent). Scrolling to the bottom loads more.
 * With `jump`, loads up to the first message at or after that time and scrolls to it
 * (once per change of `key`).
 */
export function Conversation({
  sessionId,
  agent,
  jump = null,
}: {
  sessionId: string;
  agent: string | null;
  jump?: { ts: number; key: number } | null;
}) {
  const t = conversationMessages();
  const query = useMessages(sessionId, agent);
  const messages = useMemo(() => query.data?.pages.flatMap((p) => p.messages) ?? [], [query.data]);
  const results = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) if (m.kind === "tool_result" && m.toolUseId) map.set(m.toolUseId, m);
    return map;
  }, [messages]);

  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Scroll to the requested time, fetching more pages if it is not loaded yet
  const jumped = useRef<number | null>(null);
  useEffect(() => {
    if (!jump || jumped.current === jump.key || messages.length === 0) return;
    const target = messages.find(
      (m) => m.kind !== "tool_result" && m.ts !== null && m.ts >= jump.ts,
    );
    if (!target) {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
      return;
    }
    const el = document.getElementById(`msg-${target.id}`);
    if (!el) return;
    jumped.current = jump.key;
    // The jump can be long, so skip smooth scrolling
    el.scrollIntoView({ block: "start" });
  }, [jump, messages, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (query.isPending) return <p className="text-muted-foreground text-sm">{t.loading}</p>;
  if (query.isError)
    return <p className="text-destructive text-sm">{t.loadFailed(query.error.message)}</p>;
  if (messages.length === 0) return <p className="text-muted-foreground text-sm">{t.empty}</p>;

  return (
    <ol className="space-y-3">
      {messages.map((m) =>
        m.kind === "tool_result" ? null : (
          <li key={m.id} id={`msg-${m.id}`} className="scroll-mt-4">
            <Entry message={m} result={m.toolUseId ? results.get(m.toolUseId) : undefined} />
          </li>
        ),
      )}
      <div ref={sentinel} />
      {hasNextPage && (
        <button
          type="button"
          className="w-full rounded-md border py-1.5 text-muted-foreground text-xs hover:bg-accent disabled:opacity-60"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? t.loadingMore : t.loadMore}
        </button>
      )}
    </ol>
  );
}

function Time({ ts }: { ts: number | null }) {
  return ts ? <time className="font-num text-[11px] text-muted-foreground">{hhmm(ts)}</time> : null;
}

function Entry({ message: m, result }: { message: Message; result: Message | undefined }) {
  const t = conversationMessages();
  switch (m.kind) {
    case "prompt":
    case "command":
      return (
        <div className="ml-8 rounded-lg bg-accent px-3 py-2">
          <div className="mb-0.5 flex items-center justify-between">
            <span className="font-medium text-xs">{t.you}</span>
            <Time ts={m.ts} />
          </div>
          {m.kind === "command" ? (
            <code className="text-sm">{m.text}</code>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm">{m.text}</p>
          )}
        </div>
      );
    case "assistant":
      return (
        <div>
          <div className="mb-0.5 flex items-center justify-between">
            <span className="font-medium text-xs">Claude</span>
            <Time ts={m.ts} />
          </div>
          <Markdown>{m.text ?? ""}</Markdown>
        </div>
      );
    case "tool_use":
      return <ToolCall message={m} result={result} />;
    case "compact":
      return (
        <div className="flex items-center gap-3 text-muted-foreground text-xs">
          <span className="h-px flex-1 bg-border" />
          {t.compacted}
          <span className="h-px flex-1 bg-border" />
        </div>
      );
    case "interrupt":
      return <p className="text-muted-foreground text-xs">{t.interrupted}</p>;
    case "error":
      return <p className="text-destructive text-xs">{t.error(m.text ?? "")}</p>;
    case "scheduled":
      return <SystemLine ts={m.ts} label={t.scheduled} text={firstLine(m.text)} />;
    case "notification":
      return <SystemLine ts={m.ts} label={t.notification} text={notificationSummary(m.text)} />;
    case "peer":
      return <SystemLine ts={m.ts} label={t.peer} text={firstLine(m.text)} />;
    default:
      return null;
  }
}

function SystemLine({ ts, label, text }: { ts: number | null; label: string; text: string }) {
  return (
    <div className="flex items-baseline gap-2 text-muted-foreground text-xs">
      <span className="shrink-0 rounded border px-1.5">{label}</span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <Time ts={ts} />
    </div>
  );
}

function ToolCall({ message: m, result }: { message: Message; result: Message | undefined }) {
  const t = conversationMessages();
  return (
    <details className="group rounded-md border text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <span className="font-medium">{m.toolName}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{m.text}</span>
        {result?.isError && <span className="text-destructive">{t.failed}</span>}
      </summary>
      <div className="space-y-2 border-t px-2 py-2">
        {m.detail && <Pre>{m.detail}</Pre>}
        {result?.text && (
          <>
            <p className="text-muted-foreground">{t.result}</p>
            <Pre className={cn(result.isError && "text-destructive")}>{result.text}</Pre>
          </>
        )}
      </div>
    </details>
  );
}

function Pre({ children, className }: { children: string; className?: string }) {
  return (
    <pre
      className={cn(
        "max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-[11px]",
        className,
      )}
    >
      {children}
    </pre>
  );
}

function firstLine(text: string | null): string {
  return (text ?? "").replace(/^#+\s*/, "").split("\n")[0] ?? "";
}

function notificationSummary(text: string | null): string {
  const summary = /<summary>([\s\S]*?)<\/summary>/.exec(text ?? "")?.[1];
  return summary?.trim() || firstLine(text);
}
