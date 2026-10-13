import type { LiveSession, Project } from "@shared/api.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { formatMessages } from "@/i18n/messages/format.ts";
import { liveMessages } from "@/i18n/messages/live.ts";
import { projectColor } from "@/lib/colors.ts";
import { durationLabel } from "@/lib/dates.ts";
import { tokensLabel } from "@/lib/format.ts";
import { dirName, type LiveDisplay, liveDisplay } from "@/lib/live.ts";
import { cn } from "@/lib/utils.ts";

/**
 * A row under the toolbar with one card per Claude Code session running now, ordered so the
 * ones that want an answer come first. Clicking a card opens its latest work block in the drawer.
 * Absent when nothing is running.
 */
export function LiveBar({
  sessions,
  projects,
  now,
  onSelect,
}: {
  /** Already filtered and ordered (`visibleLive`). */
  sessions: LiveSession[];
  projects: ReadonlyMap<number, Project>;
  now: number;
  onSelect: (session: string, at: number) => void;
}) {
  if (sessions.length === 0) return null;
  return (
    <section
      aria-label={liveMessages().rowLabel}
      // The filter chips' row below draws the rule under both, so the area gets one, not two
      className="flex shrink-0 flex-wrap items-center gap-1.5 border-b bg-background px-5 py-1.5 has-[+section]:border-b-0 max-lg:px-3"
    >
      {sessions.map((s) => (
        <LiveCard
          key={s.id}
          session={s}
          project={s.projectId === null ? undefined : projects.get(s.projectId)}
          now={now}
          onSelect={onSelect}
        />
      ))}
    </section>
  );
}

/** One running session: its state dot, title and how long it has been in that state. */
function LiveCard({
  session,
  project,
  now,
  onSelect,
}: {
  session: LiveSession;
  project: Project | undefined;
  now: number;
  onSelect: (session: string, at: number) => void;
}) {
  const m = liveMessages();
  const display = liveDisplay(session, now);
  const name = cardTitle(session);
  const duration = durationLabel(now - session.since);
  const status = m.status(m.state[display], duration);
  const section = session.section;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={section === null}
          onClick={() => section !== null && onSelect(session.id, section)}
          aria-label={`${name} — ${status}`}
          className={cn(
            "flex h-7 min-w-0 max-w-72 items-center gap-1.5 rounded-r-md rounded-l-[3px] border-l-[3px] border-l-[var(--c)] bg-[color-mix(in_oklch,var(--c)_var(--mix-block-dim),var(--block-base))] pr-2 pl-2 text-xs focus-visible:outline-2 focus-visible:outline-ring enabled:hover:bg-[color-mix(in_oklch,var(--c)_var(--mix-block),var(--block-base))] disabled:cursor-default",
          )}
          style={{ "--c": projectColor(project) } as React.CSSProperties}
        >
          <StateDot display={display} />
          <span
            className={cn(
              "min-w-0 truncate font-medium",
              // Idle is left open rather than waiting on you, so its title steps back a tone
              display === "idle" && "text-muted-foreground",
            )}
          >
            {name}
          </span>
          <span
            className={cn("shrink-0", display === "asking" ? "text-warn" : "text-muted-foreground")}
          >
            {m.state[display]}
            {formatMessages().separator}
            <span className="font-num">{duration}</span>
          </span>
        </button>
      </TooltipTrigger>
      <LiveTooltip session={session} project={project} name={name} status={status} />
    </Tooltip>
  );
}

/** The session's name: its title once ingested, else Claude Code's name or its directory. */
function cardTitle(s: LiveSession): string {
  return s.title ?? s.name ?? dirName(s.cwd);
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

/** What the card can't fit: project, the call in flight or the question, tasks, tests, recap. */
function LiveTooltip({
  session: s,
  project,
  name,
  status,
}: {
  session: LiveSession;
  project: Project | undefined;
  name: string;
  status: string;
}) {
  const m = liveMessages();
  const f = formatMessages();
  const where = [
    project?.name ?? dirName(s.cwd),
    s.label ? f.sessionLabel(s.label) : "",
    s.branch ? `${f.separator}${s.branch}` : "",
  ].join("");
  return (
    <TooltipContent side="bottom" className="max-w-96 flex-col items-start gap-0.5">
      <p className="font-medium">{name}</p>
      <p className="opacity-70">
        {where}
        {s.background ? `${f.separator}${m.background}` : ""}
      </p>
      <p className="font-num opacity-70">{status}</p>
      {s.tool && <p className="break-all">{m.tool(s.tool.name, s.tool.text)}</p>}
      {s.question && <p>{m.question(s.question)}</p>}
      {s.tasks && (
        <p>
          <span className="font-num">{m.tasks(s.tasks.done, s.tasks.total)}</span>
          {s.tasks.current ? `${f.separator}${m.currentTask(s.tasks.current)}` : ""}
        </p>
      )}
      {s.test && <p className="break-all">{testLine(s.test)}</p>}
      {s.contextTokens !== null && (
        <p className="font-num opacity-70">{m.context(tokensLabel(s.contextTokens))}</p>
      )}
      {s.recap && <p className="mt-1 opacity-70">{m.recap(s.recap)}</p>}
      <p className="mt-1 opacity-70">{s.section === null ? m.notIngested : m.open}</p>
    </TooltipContent>
  );
}

/** The last test's line: passed, failed, or ran with its exit status hidden. */
function testLine(test: NonNullable<LiveSession["test"]>): string {
  const m = liveMessages();
  if (test.passed === null) return m.testEnded(test.command);
  return test.passed ? m.testPassed(test.command) : m.testFailed(test.command);
}
