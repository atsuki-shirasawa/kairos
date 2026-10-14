import type { LiveResponse, LiveSession, Project } from "@shared/api.ts";
import { MINUTE } from "@shared/dates.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { liveMessages } from "@/i18n/messages/live.ts";
import { projectColor } from "@/lib/colors.ts";
import { elapsedLabel, timeOrDateTime } from "@/lib/dates.ts";
import {
  columnOf,
  dirName,
  groupByColumn,
  IDLE_AFTER_MS,
  LIVE_COLUMNS,
  type LiveColumn,
  type LiveDisplay,
  livePlace,
  toolLabel,
} from "@/lib/live.ts";
import { cn } from "@/lib/utils.ts";
import { CardCost, ContextGauge, RowCache } from "./live/CardUsage.tsx";
import { SpendBand } from "./live/SpendBand.tsx";

/**
 * The page of Claude Code sessions running now, in three columns: what waits on you, what is
 * working, and what was left idle. Each card is a small work block with what the log says about
 * the session's current state and cost; clicking it opens the latest work block in the drawer.
 * A band above the columns shows what all sessions spend.
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
  // Spend comes from the logs, so the band stays when the registry can't be read
  const band = <SpendBand spend={live.spend} projects={projects} />;
  if (!live.available) return <PageNote band={band}>{m.unavailable}</PageNote>;
  if (sessions.length === 0) return <PageNote band={band}>{m.nothingRunning}</PageNote>;
  const byColumn = groupByColumn(sessions, now);
  const nothingOnYou = byColumn.get("attention")?.length === 0;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-card">
      {band}
      <div
        className={cn(
          "grid gap-x-5 gap-y-6 px-5 py-5 max-lg:px-3",
          // An empty On you column only says so: its third of the width goes to the cards
          nothingOnYou ? "lg:grid-cols-[13rem_1fr_1fr]" : "lg:grid-cols-3",
        )}
      >
        {LIVE_COLUMNS.map((column) => {
          const entries = byColumn.get(column) ?? [];
          return (
            <section key={column} aria-labelledby={`live-${column}`} className="min-w-0">
              <ColumnHeader column={column} count={entries.length} />
              <div className="mt-3 flex flex-col gap-2">
                {entries.map(({ session: s, display }) => (
                  <LiveCard
                    key={s.id}
                    session={s}
                    display={display}
                    project={s.projectId === null ? undefined : projects.get(s.projectId)}
                    now={now}
                    selected={s.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
                {entries.length === 0 && (
                  <p className="text-muted-foreground text-xs">
                    {column === "attention" ? m.nothingOnYou : formatMessages().none}
                  </p>
                )}
              </div>
            </section>
          );
        })}
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
        {column === "idle" ? m.columnNote.idle(IDLE_AFTER_MS / MINUTE) : m.columnNote[column]}
      </p>
    </header>
  );
}

/**
 * A message in place of the columns (nothing running, or the registry can't be read), under the
 * spend band.
 */
function PageNote({ band, children }: { band: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      {band}
      <div className="flex flex-1 items-center justify-center px-4">
        <p className="max-w-md text-center text-muted-foreground text-sm" role="status">
          {children}
        </p>
      </div>
    </div>
  );
}

/**
 * One running session as a card: the project's colored edge on a neutral raised fill, what it is
 * called and where, its state and how long it has lasted, then what it is doing now. An idle
 * session is a single row instead (title, place and how long), with no fill: it was left open, so
 * it shouldn't weigh as much as the sessions in play. Its details are in the drawer.
 */
function LiveCard({
  session: s,
  display,
  project,
  now,
  selected,
  onSelect,
}: {
  session: LiveSession;
  display: LiveDisplay;
  project: Project | undefined;
  now: number;
  selected: boolean;
  onSelect: (session: string, at: number) => void;
}) {
  const m = liveMessages();
  const name = s.title ?? s.name ?? dirName(s.cwd);
  const duration = elapsedLabel(now - s.since);
  const section = s.section;
  // A session not in the log yet has no block to open: its card is plain content
  const open = section === null ? null : () => onSelect(s.id, section);
  const compact = display === "idle";
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
        "flex flex-col rounded-r-md rounded-l-[3px] border-l-[3px] border-l-[var(--c)] has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-ring",
        compact ? "px-3 py-1.5" : "gap-2 bg-muted px-3 py-2.5",
        open && "cursor-pointer",
        open && (compact ? "hover:bg-muted" : "hover:bg-input"),
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
        compact={compact}
        duration={duration}
        now={now}
      />
      {/* A row has no room for more, but this says why it has nothing to open */}
      {compact && section === null && (
        <p className="pl-3.5 text-muted-foreground text-xs">{m.notIngested}</p>
      )}
      {!compact && (
        <>
          <p className="flex items-baseline gap-1 text-xs">
            {/* Only the waiting column holds two states; elsewhere the column already names it */}
            {columnOf(display) === "attention" && (
              <span className={display === "asking" ? "text-warn" : "text-muted-foreground"}>
                {m.state[display]}
              </span>
            )}
            <span className="font-num text-muted-foreground">{duration}</span>
            <span className="ml-auto font-num text-muted-foreground">
              {m.startedAt(timeOrDateTime(s.startedAt, now))}
            </span>
          </p>
          <CardNow session={s} display={display} now={now} />
        </>
      )}
    </article>
  );
}

/**
 * The state dot, the title, and the project, worktree and branch it runs in. The title is the
 * button that opens the latest block, when there is one. In an idle row the title keeps to one
 * line, with the duration at its right, and the place line ends with the prompt cache's state.
 */
function CardHeading({
  session: s,
  project,
  name,
  display,
  selected,
  description,
  onOpen,
  compact,
  duration,
  now,
}: {
  session: LiveSession;
  project: Project | undefined;
  name: string;
  display: LiveDisplay;
  selected: boolean;
  /** The state and how long it has lasted, said after the title. */
  description: string;
  onOpen: (() => void) | null;
  /** An idle row rather than a full card. */
  compact: boolean;
  duration: string;
  now: number;
}) {
  const m = liveMessages();
  const where = livePlace(s, project);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <StateDot display={display} />
        <h3
          className={cn(
            "min-w-0 font-medium text-sm",
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
              className="block text-left outline-none"
            >
              <Clamped compact={compact}>{name}</Clamped>
            </button>
          ) : (
            <Clamped compact={compact}>{name}</Clamped>
          )}
        </h3>
        {compact && (
          // The title button's description already says it
          <span aria-hidden className="ml-auto shrink-0 font-num text-muted-foreground text-xs">
            {duration}
          </span>
        )}
      </div>
      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 pl-3.5 text-muted-foreground text-xs">
        <span className="truncate">{where}</span>
        {s.background && (
          <span className="shrink-0 rounded-md border px-1 leading-4">{m.background}</span>
        )}
        {compact && s.section !== null && <RowCache session={s} now={now} />}
      </p>
    </div>
  );
}

/**
 * What the session is doing now: the question it asks, or the call it runs; then its tasks, the
 * last test, Claude Code's recap while it waits, the context against its window, and the cost.
 */
function CardNow({
  session: s,
  display,
  now,
}: {
  session: LiveSession;
  display: LiveDisplay;
  now: number;
}) {
  const m = liveMessages();
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {s.question && <p className="text-sm">{s.question}</p>}
      {s.tool && (
        <p className="line-clamp-2 break-all">
          <span className="font-medium">{toolLabel(s.tool.name)}</span>{" "}
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
      {s.section === null && <p className="text-muted-foreground">{m.notIngested}</p>}
      {s.section !== null && s.contextTokens !== null && (
        <ContextGauge tokens={s.contextTokens} usage={s.usage} display={display} />
      )}
      {s.section !== null && s.usage && <CardCost usage={s.usage} display={display} now={now} />}
    </div>
  );
}

/**
 * Tasks done out of all, as a thin bar in the project color on the input tone (the card is already
 * `muted`, and `border` barely differs from it), and the one in progress.
 */
function TaskProgress({ tasks }: { tasks: NonNullable<LiveSession["tasks"]> }) {
  const m = liveMessages();
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-num">{m.tasks(tasks.done, tasks.total)}</span>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-input">
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
 * The title text, clamped to one line in an idle row and two in a card. The clamp sits on the text
 * itself: on the heading it would count the inline-block button as a single line and clip nothing.
 */
function Clamped({ compact, children }: { compact: boolean; children: React.ReactNode }) {
  return <span className={compact ? "line-clamp-1" : "line-clamp-2"}>{children}</span>;
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
