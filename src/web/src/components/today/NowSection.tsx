import type { LiveResponse, LiveSession, Project } from "@shared/api.ts";
import { ArrowRight } from "lucide-react";
import { LiveEntryCard } from "@/components/live/LiveCard.tsx";
import { LiveColumnTitle } from "@/components/live/LiveColumnTitle.tsx";
import { Button } from "@/components/ui/button.tsx";
import { liveMessages } from "@/i18n/messages/live.ts";
import { todayMessages } from "@/i18n/messages/today.ts";
import { groupByColumn, type LiveEntry } from "@/lib/live.ts";
import type { OpenBlock } from "@/lib/selection.ts";

/**
 * What runs now: the sessions waiting on you as full cards, then the ones Claude is working on, a
 * line each. Idle sessions stay on the live page, which this links to.
 */
export function NowSection({
  live,
  sessions,
  projects,
  now,
  selectedId,
  onSelect,
  onLive,
}: {
  live: LiveResponse | undefined;
  /** Already filtered and ordered (`visibleLive`). */
  sessions: LiveSession[];
  projects: ReadonlyMap<number, Project>;
  now: number;
  selectedId: string | null;
  onSelect: OpenBlock;
  onLive: () => void;
}) {
  const t = todayMessages();
  const byColumn = groupByColumn(sessions, now);
  const attention = byColumn.get("attention") ?? [];
  const working = byColumn.get("working") ?? [];
  const list = { projects, now, selectedId, onSelect };
  return (
    <section aria-labelledby="today-now" className="flex min-w-0 flex-col gap-5">
      <h2 id="today-now" className="font-semibold text-title tracking-tight">
        {t.now}
      </h2>
      <NowBody
        live={live}
        active={attention.length + working.length}
        idle={byColumn.get("idle")?.length ?? 0}
      >
        <SessionGroup column="attention" entries={attention} {...list} />
        <SessionGroup column="working" entries={working} {...list} />
      </NowBody>
      <Button variant="ghost" size="sm" className="-ml-2.5 self-start" onClick={onLive}>
        {t.openLive}
        <ArrowRight aria-hidden />
      </Button>
    </section>
  );
}

/**
 * The groups, or one line in their place: the record of running sessions can't be read, nothing
 * runs, or only idle sessions do (which this page leaves to the live page). Nothing at all while
 * loading, rather than claiming nothing runs.
 */
function NowBody({
  live,
  active,
  idle,
  children,
}: {
  live: LiveResponse | undefined;
  /** Sessions waiting on you or working. */
  active: number;
  idle: number;
  children: React.ReactNode;
}) {
  if (!live) return null;
  const note = !live.available
    ? liveMessages().unavailable
    : active > 0
      ? null
      : idle > 0
        ? todayMessages().onlyIdle(idle)
        : liveMessages().nothingRunning;
  if (note)
    return (
      <p className="text-body text-muted-foreground" role="status">
        {note}
      </p>
    );
  return <>{children}</>;
}

/**
 * One state's sessions under its name and count: On you as full cards, since each asks something
 * of you, and Working as rows.
 */
function SessionGroup({
  column,
  entries,
  projects,
  now,
  selectedId,
  onSelect,
}: {
  column: "attention" | "working";
  entries: LiveEntry[];
  projects: ReadonlyMap<number, Project>;
  now: number;
  selectedId: string | null;
  onSelect: OpenBlock;
}) {
  const t = todayMessages();
  const id = `today-${column}`;
  return (
    <section aria-labelledby={id} className="min-w-0">
      <LiveColumnTitle column={column} count={entries.length} id={id} level="h3" />
      <div className="mt-2 flex flex-col gap-2">
        {entries.map((entry) => (
          <LiveEntryCard
            key={entry.session.id}
            entry={entry}
            projects={projects}
            now={now}
            selectedId={selectedId}
            onSelect={onSelect}
            // Working asks nothing of you yet: a line each
            options={{ row: column === "working" }}
          />
        ))}
        {entries.length === 0 && (
          <p className="text-label text-muted-foreground">
            {column === "attention" ? liveMessages().nothingOnYou : t.nothingWorking}
          </p>
        )}
      </div>
    </section>
  );
}
