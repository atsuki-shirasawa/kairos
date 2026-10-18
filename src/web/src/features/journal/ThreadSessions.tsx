import type { CalendarSession, Project, Thread, ThreadLink } from "@shared/api.ts";
import { threadMessages } from "@/i18n/messages/thread.ts";
import type { LaneLook } from "@/lib/dayRows.ts";
import { projectLabel, projectOf } from "@/lib/selection.ts";
import { linksBySession } from "@/lib/thread.ts";

/**
 * The thread's sessions, oldest first, each with its project's color (as its lane has below), its
 * project and branch, and what ties it in. Picking one opens its first block.
 */
export function ThreadSessions({
  thread,
  looks,
  projects,
  onSelect,
}: {
  thread: Thread;
  looks: ReadonlyMap<string, LaneLook>;
  projects: Map<number, Project>;
  onSelect: (id: string, at: number) => void;
}) {
  const m = threadMessages();
  const links = linksBySession(thread.links);
  return (
    <section className="mb-4">
      <h2 className="mb-1 font-semibold text-label text-muted-foreground tracking-wide">
        {m.sessions}
      </h2>
      <ul className="space-y-0.5">
        {thread.sessions.map((s) => (
          <SessionLine
            key={s.id}
            session={s}
            color={looks.get(s.id)?.color}
            project={projectLabel(projectOf(projects, s.projectId))}
            how={s.id === thread.seed ? m.openedFrom : tieLabel(links.get(s.id))}
            onSelect={onSelect}
          />
        ))}
      </ul>
      {thread.truncated && (
        <p className="mt-1 text-label text-muted-foreground">
          {m.truncated(thread.sessions.length)}
        </p>
      )}
    </section>
  );
}

/** One session: its color, title, project and branch, and how it came into the thread. */
function SessionLine({
  session: s,
  color,
  project,
  how,
  onSelect,
}: {
  session: CalendarSession;
  color: string | undefined;
  project: string;
  how: string;
  onSelect: (id: string, at: number) => void;
}) {
  const first = s.segments[0];
  return (
    <li className="flex min-w-0 items-baseline gap-2 text-body">
      <span
        aria-hidden
        className="size-2 shrink-0 self-center rounded-full"
        style={{ backgroundColor: color }}
      />
      <button
        type="button"
        disabled={!first}
        onClick={() => first && onSelect(s.id, first.start)}
        className="min-w-0 truncate rounded-sm text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        {s.title}
      </button>
      <span className="shrink-0 text-label text-muted-foreground">
        {[project, s.branch, how].filter(Boolean).join(" · ")}
      </span>
    </li>
  );
}

/** How a session came in, in words. */
function tieLabel(link: ThreadLink | undefined): string {
  const m = threadMessages();
  switch (link?.tie) {
    case "continued":
      return m.tieContinued;
    case "pr":
      return link.pr ? m.tiePr(`#${link.pr.number}`) : "";
    case "branch":
      return link.branch ? m.tieBranch(link.branch) : "";
    case "item":
      return m.tieItem;
    case undefined:
      return "";
  }
}
