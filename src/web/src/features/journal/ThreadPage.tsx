import type { Project, Thread } from "@shared/api.ts";
import { startOfDay } from "@shared/dates.ts";
import { useMemo } from "react";
import { Markdown } from "@/components/Markdown.tsx";
import { useThread } from "@/hooks/queries.ts";
import { threadMessages } from "@/i18n/messages/thread.ts";
import { ApiError } from "@/lib/api.ts";
import { dateLabel } from "@/lib/dates.ts";
import { blocksOfDay } from "@/lib/dayBlocks.ts";
import { dayRows, laneLooks } from "@/lib/dayRows.ts";
import { MATCH_ALL } from "@/lib/filter.ts";
import { spanLabel, threadBlockCount, threadDays, threadGoal, threadSpan } from "@/lib/thread.ts";
import { DayRows } from "./DayRows.tsx";
import { ThreadItems } from "./ThreadItems.tsx";
import { ThreadSessions } from "./ThreadSessions.tsx";

/** What the thread page draws besides the thread: the projects, the open block, and the time. */
export interface ThreadPageProps {
  /** The session the thread was opened from. */
  seed: string;
  projects: Map<number, Project>;
  selectedId: string | null;
  selectedAt: number | null;
  now: number;
  onSelect: (id: string, at: number) => void;
}

/**
 * A thread's page: the sessions behind one piece of work, read top to bottom. What it set out to
 * do, which sessions it took and what ties each in, its blocks day by day with a lane per session,
 * and how the items it left open stand now. Built from summaries already written.
 */
export function ThreadPage(props: ThreadPageProps) {
  const thread = useThread(props.seed);
  if (thread.error) return <ThreadNotice error={thread.error} />;
  if (!thread.data) return null;
  return <ThreadBody {...props} thread={thread.data} />;
}

/** Why the thread isn't shown: its session is hidden or gone, or the request failed. */
function ThreadNotice({ error }: { error: Error }) {
  const m = threadMessages();
  const text =
    error instanceof ApiError && error.status === 404 ? m.notFound : m.failed(error.message);
  return (
    <div className="flex-1 bg-card px-6 py-8">
      <p className="text-body text-muted-foreground" role="alert">
        {text}
      </p>
    </div>
  );
}

/** The loaded thread. */
function ThreadBody({ thread, ...props }: ThreadPageProps & { thread: Thread }) {
  const { sessions } = thread;
  const looks = useMemo(() => laneLooks(sessions, props.projects), [sessions, props.projects]);
  const days = useMemo(() => threadDays(sessions), [sessions]);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-card">
      <div className="mx-auto max-w-[72rem] px-6 py-5 max-lg:px-3">
        <ThreadHead thread={thread} now={props.now} />
        <ThreadSessions
          thread={thread}
          looks={looks}
          projects={props.projects}
          onSelect={props.onSelect}
        />
        {days.map((day) => (
          <ThreadDay key={day} day={day} thread={thread} looks={looks} {...props} />
        ))}
        <ThreadItems items={thread.openItems} now={props.now} onSelect={props.onSelect} />
      </div>
    </div>
  );
}

/** The thread's Goal, and how many sessions and blocks it took over which days. */
function ThreadHead({ thread, now }: { thread: Thread; now: number }) {
  const m = threadMessages();
  const goal = threadGoal(thread.sessions);
  const span = threadSpan(thread.sessions);
  return (
    <header className="mb-5 space-y-1">
      <p className="font-semibold text-label text-muted-foreground tracking-wide">{m.goal}</p>
      {goal ? (
        <Markdown
          plain
          className="font-semibold text-title leading-snug tracking-tight [&_p]:inline"
        >
          {goal}
        </Markdown>
      ) : (
        <p className="text-body text-muted-foreground">{m.noGoal}</p>
      )}
      {span && (
        <p className="font-num text-meta text-muted-foreground">
          {m.figures(
            thread.sessions.length,
            threadBlockCount(thread.sessions),
            spanLabel(span, now),
          )}
        </p>
      )}
    </header>
  );
}

/** One day of the thread: its date, then its blocks as the day page lists them. */
function ThreadDay({
  day,
  thread,
  looks,
  projects,
  selectedId,
  selectedAt,
  now,
  onSelect,
}: ThreadPageProps & {
  day: number;
  thread: Thread;
  looks: ReturnType<typeof laneLooks>;
}) {
  const rows = useMemo(
    () => dayRows(blocksOfDay(thread.sessions, day, startOfDay(day, 1))),
    [thread, day],
  );
  const label = dateLabel(day, now);
  return (
    <section className="border-t py-2">
      <h2 className="px-3 pt-2 font-num font-semibold text-body">{label}</h2>
      <DayRows
        label={threadMessages().dayWork(label)}
        rows={rows}
        looks={looks}
        projects={projects}
        selectedId={selectedId}
        selectedAt={selectedAt}
        matches={MATCH_ALL}
        onSelect={onSelect}
      />
    </section>
  );
}
