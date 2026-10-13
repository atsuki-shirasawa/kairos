import type { LiveResponse, LiveSession, Project } from "@shared/api.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { liveMessages } from "@/i18n/messages/live.ts";
import { projectColor } from "@/lib/colors.ts";
import { durationLabel, hhmm } from "@/lib/dates.ts";
import { tokensLabel } from "@/lib/format.ts";
import {
  columnOf,
  dirName,
  IDLE_AFTER_MS,
  LIVE_COLUMNS,
  type LiveColumn,
  type LiveDisplay,
  liveDisplay,
} from "@/lib/live.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The page of Claude Code sessions running now, in three columns: what waits on you, what is
 * working, and what was left idle. Each card is a small work block with what the log says about
 * the session's current state; clicking it opens the latest work block in the drawer.
 */
export function LivePage({
  live,
  sessions,
  projects,
  now,
  selectedId,
  onSelect,
}: {
  live: LiveResponse | undefined;
  /** Already filtered and ordered (`visibleLive`). */
  sessions: LiveSession[];
  projects: ReadonlyMap<number, Project>;
  now: number;
  selectedId: string | null;
  onSelect: (session: string, at: number) => void;
}) {
  const m = liveMessages();
  // Loading, or the server is gone (the app's disconnected notice says so): claiming that
  // nothing runs would be wrong either way
  if (!live) return <div className="min-h-0 flex-1 bg-card" />;
  if (!live.available) return <PageNote>{m.unavailable}</PageNote>;
  if (sessions.length === 0) return <PageNote>{m.nothingRunning}</PageNote>;
  const byColumn = new Map<LiveColumn, LiveSession[]>(LIVE_COLUMNS.map((c) => [c, []]));
  for (const s of sessions) byColumn.get(columnOf(liveDisplay(s, now)))?.push(s);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-card">
      <div className="grid gap-x-5 gap-y-6 px-5 py-5 max-lg:px-3 lg:grid-cols-3">
        {LIVE_COLUMNS.map((column) => (
          <section key={column} aria-labelledby={`live-${column}`} className="min-w-0">
            <ColumnHeader column={column} count={byColumn.get(column)?.length ?? 0} />
            <div className="mt-3 flex flex-col gap-2">
              {byColumn.get(column)?.map((s) => (
                <LiveCard
                  key={s.id}
                  session={s}
                  project={s.projectId === null ? undefined : projects.get(s.projectId)}
                  now={now}
                  selected={s.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
              {byColumn.get(column)?.length === 0 && (
                <p className="text-muted-foreground text-xs">{formatMessages().none}</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** A column's name and count, with what puts a session there. */
function ColumnHeader({ column, count }: { column: LiveColumn; count: number }) {
  const m = liveMessages();
  return (
    <header>
      <h2 id={`live-${column}`} className="flex items-baseline gap-2 font-medium text-sm">
        {m.columns[column]}
        <span
          className={cn(
            "font-num",
            column === "attention" && count > 0 ? "text-warn" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      </h2>
      <p className="text-muted-foreground text-xs">
        {column === "idle" ? m.columnNote.idle(IDLE_AFTER_MS / 60_000) : m.columnNote[column]}
      </p>
    </header>
  );
}

/** A message in place of the columns (nothing running, or the registry can't be read). */
function PageNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-card px-4">
      <p className="max-w-md text-center text-muted-foreground text-sm" role="status">
        {children}
      </p>
    </div>
  );
}

/**
 * One running session as a small work block: the project's colored edge and dim fill, what it
 * is called and where, its state and how long it has lasted, then what it is doing now.
 */
function LiveCard({
  session: s,
  project,
  now,
  selected,
  onSelect,
}: {
  session: LiveSession;
  project: Project | undefined;
  now: number;
  selected: boolean;
  onSelect: (session: string, at: number) => void;
}) {
  const m = liveMessages();
  const display = liveDisplay(s, now);
  const name = s.title ?? s.name ?? dirName(s.cwd);
  const duration = durationLabel(now - s.since);
  const section = s.section;
  // A session not in the log yet has no block to open: its card is plain content
  const open = section === null ? null : () => onSelect(s.id, section);
  return (
    // The title is the card's button, for the keyboard and screen readers; a click anywhere else
    // on the card does the same, unless it ends a text selection (a command or question to copy).
    // A button covering the whole card would block selecting that text
    // biome-ignore lint/a11y/useKeyWithClickEvents: the title button is the keyboard path
    <article
      onClick={() => {
        if (open && !window.getSelection()?.toString()) open();
      }}
      className={cn(
        "flex flex-col gap-2 rounded-r-md rounded-l-[3px] border-l-[3px] border-l-[var(--c)] bg-[color-mix(in_oklch,var(--c)_var(--mix-block-dim),var(--block-base))] px-3 py-2.5 has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-ring",
        open &&
          "cursor-pointer hover:bg-[color-mix(in_oklch,var(--c)_var(--mix-block),var(--block-base))]",
        selected && "outline-2 outline-primary",
      )}
      style={{ "--c": projectColor(project) } as React.CSSProperties}
    >
      <CardHeading
        session={s}
        project={project}
        name={name}
        display={display}
        selected={selected}
        description={m.status(m.state[display], duration)}
        onOpen={open}
      />
      <p className="flex items-baseline gap-1 text-xs">
        <span className={display === "asking" ? "text-warn" : "text-muted-foreground"}>
          {m.state[display]}
        </span>
        <span className="font-num text-muted-foreground">{duration}</span>
        <span className="ml-auto font-num text-muted-foreground">
          {m.startedAt(hhmm(s.startedAt))}
        </span>
      </p>
      <CardNow session={s} display={display} />
    </article>
  );
}

/**
 * The state dot, the title, and the project, worktree and branch it runs in. The title is the
 * button that opens the latest block, when there is one.
 */
function CardHeading({
  session: s,
  project,
  name,
  display,
  selected,
  description,
  onOpen,
}: {
  session: LiveSession;
  project: Project | undefined;
  name: string;
  display: LiveDisplay;
  selected: boolean;
  /** The state and how long it has lasted, said after the title. */
  description: string;
  onOpen: (() => void) | null;
}) {
  const m = liveMessages();
  const f = formatMessages();
  const where = [
    project?.name ?? dirName(s.cwd),
    s.label ? f.sessionLabel(s.label) : "",
    s.branch ? `${f.separator}${s.branch}` : "",
  ].join("");
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <StateDot display={display} />
        <h3
          className={cn(
            "line-clamp-2 min-w-0 font-medium text-sm",
            display === "idle" && "text-muted-foreground",
          )}
        >
          {onOpen ? (
            <button
              type="button"
              // The card's own click handler opens it; this one would open it twice
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              aria-pressed={selected}
              aria-description={description}
              className="text-left outline-none"
            >
              {name}
            </button>
          ) : (
            name
          )}
        </h3>
      </div>
      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 pl-3.5 text-muted-foreground text-xs">
        <span className="truncate">{where}</span>
        {s.background && (
          <span className="shrink-0 rounded-md border px-1 leading-4">{m.background}</span>
        )}
      </p>
    </div>
  );
}

/**
 * What the session is doing now: the question it asks, or the call it runs; then its tasks, the
 * last test, the context size, and Claude Code's recap while it waits.
 */
function CardNow({ session: s, display }: { session: LiveSession; display: LiveDisplay }) {
  const m = liveMessages();
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {s.question && <p className="text-sm">{s.question}</p>}
      {s.tool && (
        <p className="line-clamp-2 break-all">
          <span className="font-medium">{s.tool.name}</span>{" "}
          <span className="text-muted-foreground">{s.tool.text}</span>
        </p>
      )}
      {s.tasks && <TaskProgress tasks={s.tasks} />}
      {s.test && (
        <p className="flex min-w-0 gap-1.5">
          <span className={cn("shrink-0", s.test.passed === false && "text-warn")}>
            {s.test.passed === null ? m.testEnded : s.test.passed ? m.testPassed : m.testFailed}
          </span>
          <span className="truncate text-muted-foreground">{s.test.command}</span>
        </p>
      )}
      {s.recap && display !== "working" && (
        <p className="line-clamp-3 text-muted-foreground">{s.recap}</p>
      )}
      {(s.contextTokens !== null || s.section === null) && (
        <p className="font-num text-muted-foreground">
          {s.section === null ? m.notIngested : m.context(tokensLabel(s.contextTokens ?? 0))}
        </p>
      )}
    </div>
  );
}

/** Tasks done out of all, as a thin bar in the project color, and the one in progress. */
function TaskProgress({ tasks }: { tasks: NonNullable<LiveSession["tasks"]> }) {
  const m = liveMessages();
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-num">{m.tasks(tasks.done, tasks.total)}</span>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-[var(--c)]"
            style={{ width: `${(tasks.done / Math.max(tasks.total, 1)) * 100}%` }}
          />
        </span>
      </div>
      {tasks.current && <p className="mt-0.5 truncate text-muted-foreground">{tasks.current}</p>}
    </div>
  );
}

/**
 * Working pulses in the project color, like the calendar's work in progress. Asking is a solid
 * dot in the warn tone, since it holds the turn until answered; waiting and idle are a ring.
 */
function StateDot({ display }: { display: LiveDisplay }) {
  const base = "size-1.5 shrink-0 rounded-full";
  if (display === "working")
    return <span className={cn(base, "animate-pulse bg-[var(--c)] motion-reduce:animate-none")} />;
  if (display === "asking") return <span className={cn(base, "bg-warn")} />;
  return <span className={cn(base, "border border-muted-foreground")} />;
}
