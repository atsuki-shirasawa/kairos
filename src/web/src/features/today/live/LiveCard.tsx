import type { LiveSession, Project } from "@shared/api.ts";
import { StatusDot } from "@/components/ui/status-dot.tsx";
import { Tag } from "@/components/ui/tag.tsx";
import { liveMessages } from "@/i18n/messages/live.ts";
import { projectColor } from "@/lib/colors.ts";
import { timeOrDateTime } from "@/lib/dates.ts";
import {
  columnOf,
  type LiveCardOptions,
  type LiveCardView,
  type LiveDisplay,
  type LiveEntry,
  liveCardView,
} from "@/lib/live.ts";
import { type OpenBlock, projectOf } from "@/lib/selection.ts";
import { cn } from "@/lib/utils.ts";
import { CallLine } from "./CallLine.tsx";
import { AgentCount, CardAgents, RowAgents } from "./CardAgents.tsx";
import { CardFooter, RowCache } from "./CardUsage.tsx";
import { ProgressBar } from "./ProgressBar.tsx";

/**
 * A session placed in its column, as its card: works out its project and card view, so every page
 * listing running sessions draws them the same way.
 */
export function LiveEntryCard({
  entry: { session, display },
  projects,
  now,
  selectedId,
  onSelect,
  options,
}: {
  entry: LiveEntry;
  projects: ReadonlyMap<number, Project>;
  now: number;
  selectedId: string | null;
  onSelect: OpenBlock;
  options?: LiveCardOptions;
}) {
  const project = projectOf(projects, session.projectId);
  return (
    <LiveCard
      card={liveCardView(session, display, project, now, options)}
      project={project}
      now={now}
      selected={session.id === selectedId}
      onSelect={onSelect}
    />
  );
}

/**
 * One running session as a card: the project's colored edge on a neutral raised fill, what it is
 * called and where, its state and how long it has lasted, then what it is doing now. An idle
 * session is a single row instead (title, place and how long), with no fill: it was left open, so
 * it shouldn't weigh as much as the sessions in play. Its details are in the drawer.
 */
export function LiveCard({
  card,
  project,
  now,
  selected,
  onSelect,
}: {
  card: LiveCardView;
  project: Project | undefined;
  now: number;
  selected: boolean;
  onSelect: OpenBlock;
}) {
  const m = liveMessages();
  const { session: s, display, compact } = card;
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
        "flex flex-col rounded-r-md rounded-l-[3px] border-l-[3px] border-l-[var(--c)] has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-ring",
        cardTone(display, compact),
        open && ["cursor-pointer", cardHover(display, compact)],
        selected && "outline-2 outline-primary",
      )}
      style={{ "--c": projectColor(project) } as React.CSSProperties}
    >
      <CardHeading card={card} selected={selected} onOpen={open} now={now} />
      {/* A row has no room for more, but this says why it has nothing to open */}
      {compact && section === null && (
        <p className="pl-3.5 text-label text-muted-foreground">{m.notIngested}</p>
      )}
      {/* An idle row stays bare: its subagents are only counted on its place line */}
      {compact && display !== "idle" && <RowAgents session={s} />}
      {!compact && <CardNow session={s} display={display} now={now} />}
      {!compact && <CardFooter session={s} display={display} now={now} />}
    </article>
  );
}

/**
 * How much a card weighs, by whose turn it is: a session waiting on you sits on the `muted` fill,
 * one Claude is working on is only outlined, and a row (an idle session, or any session where a
 * page lists it in one line) is bare.
 */
function cardTone(display: LiveDisplay, compact: boolean): string {
  if (compact) return "px-3 py-1.5";
  const column = columnOf(display);
  // A transparent border keeps the inset of an outlined Working card, so text lines up across columns
  if (column === "attention")
    return "gap-2.5 border-y border-r border-y-transparent border-r-transparent bg-muted px-3 py-2.5";
  if (column === "working") return "gap-2.5 border border-l-[3px] px-3 py-2.5";
  return "px-3 py-1.5";
}

/** The hover of a card that opens: one step deeper than its tone (`cardTone`). */
function cardHover(display: LiveDisplay, compact: boolean): string {
  return !compact && columnOf(display) === "attention" ? "hover:bg-input" : "hover:bg-muted";
}

/**
 * The state dot, the title, and the project, worktree and branch it runs in. The title is the
 * button that opens the latest block, when there is one. In an idle row the title keeps to one
 * line, with the duration at its right, and the place line ends with the prompt cache's state.
 */
function CardHeading({
  card,
  selected,
  onOpen,
  now,
}: {
  card: LiveCardView;
  selected: boolean;
  onOpen: (() => void) | null;
  now: number;
}) {
  const m = liveMessages();
  const { session: s, display, name, description, compact, duration } = card;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <StateDot display={display} />
        <h3
          className={cn(
            "min-w-0 font-medium text-body",
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
        {/* The title button's description says it; a card without one has only this */}
        <span
          aria-hidden={onOpen !== null}
          className="ml-auto flex shrink-0 gap-1 self-start pt-0.5 text-label"
        >
          {/* Only the waiting column holds two states; elsewhere the column already names it */}
          {columnOf(display) === "attention" && (
            <span className={display === "asking" ? "text-warn" : "text-muted-foreground"}>
              {m.state[display]}
            </span>
          )}
          <span className="font-num text-muted-foreground">{duration}</span>
        </span>
      </div>
      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 pl-3.5 text-label text-muted-foreground">
        <span className="truncate">{card.place}</span>
        {s.background && (
          <Tag variant="compact" className="shrink-0">
            {m.background}
          </Tag>
        )}
        {compact && <AgentCount session={s} />}
        {compact && s.section !== null && <RowCache session={s} now={now} />}
        {!compact && (
          <span className="ml-auto shrink-0 font-num">
            {m.startedAt(timeOrDateTime(s.startedAt, now))}
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * What the session is doing now: the question it asks, or the call it runs (its delegate's, while a
 * subagent does the work), and its subagents; then its tasks, the last test, and Claude Code's
 * recap while it waits. Context and tokens go in the footer.
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
    <div className="flex flex-col gap-1.5 text-label">
      {s.question && <p className="text-body">{s.question}</p>}
      <CallLine session={s} now={now} />
      <CardAgents session={s} now={now} />
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
    </div>
  );
}

/** Tasks done out of all, and the one in progress. */
function TaskProgress({ tasks }: { tasks: NonNullable<LiveSession["tasks"]> }) {
  const m = liveMessages();
  return (
    <div>
      <ProgressBar label={m.tasks(tasks.done, tasks.total)} done={tasks.done} total={tasks.total} />
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
  if (display === "working")
    return <StatusDot look={{ state: "pulse", tone: "project" }} className="shrink-0" />;
  if (display === "asking")
    return <StatusDot look={{ state: "solid", tone: "warn" }} className="shrink-0" />;
  return <StatusDot look={{ state: "ring" }} className="shrink-0" />;
}
