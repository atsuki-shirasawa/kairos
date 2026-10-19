import type { LiveResponse, LiveSession, Project } from "@shared/api.ts";
import { MINUTE } from "@shared/dates.ts";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { liveMessages } from "@/i18n/messages/live.ts";
import { todayMessages } from "@/i18n/messages/today.ts";
import { groupByColumn, IDLE_AFTER_MS, type LiveEntry } from "@/lib/live.ts";
import type { OpenBlock } from "@/lib/selection.ts";
import { cn } from "@/lib/utils.ts";
import { LiveEntryCard } from "./live/LiveCard.tsx";
import { LiveColumnTitle } from "./live/LiveColumnTitle.tsx";
import { TokenBand } from "./live/TokenBand.tsx";

/** What every group of running sessions is given to draw its entries. */
interface EntryList {
  projects: ReadonlyMap<number, Project>;
  now: number;
  selectedId: string | null;
  onSelect: OpenBlock;
}

/**
 * What runs now: today's tokens, then the sessions waiting on you as full cards, the ones Claude
 * is working on as a line each, and the idle ones folded away behind their count.
 */
export function NowSection({
  live,
  sessions,
  ...list
}: EntryList & {
  live: LiveResponse | undefined;
  /** Already filtered and ordered (`visibleLive`). */
  sessions: LiveSession[];
}) {
  const t = todayMessages();
  const byColumn = groupByColumn(sessions, list.now);
  return (
    <section aria-labelledby="today-now" className="flex min-w-0 flex-col gap-5">
      <h2 id="today-now" className="font-semibold text-title tracking-tight">
        {t.now}
      </h2>
      {/* Tokens come from the logs and limits from the status line, so the band stays when the
          registry can't be read */}
      {live && (
        <TokenBand
          tokens={live.tokens}
          limits={live.limits}
          projects={list.projects}
          now={list.now}
        />
      )}
      <NowBody live={live} running={sessions.length}>
        <SessionGroup column="attention" entries={byColumn.get("attention") ?? []} {...list} />
        <SessionGroup column="working" entries={byColumn.get("working") ?? []} {...list} />
        <IdleGroup entries={byColumn.get("idle") ?? []} {...list} />
      </NowBody>
    </section>
  );
}

/**
 * The groups, or one line in their place: the record of running sessions can't be read, or
 * nothing runs. Nothing at all while loading, rather than claiming nothing runs.
 */
function NowBody({
  live,
  running,
  children,
}: {
  live: LiveResponse | undefined;
  running: number;
  children: React.ReactNode;
}) {
  if (!live) return null;
  const m = liveMessages();
  const note = !live.available ? m.unavailable : running === 0 ? m.nothingRunning : null;
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
  ...list
}: EntryList & { column: "attention" | "working"; entries: LiveEntry[] }) {
  const id = `today-${column}`;
  return (
    <section aria-labelledby={id} className="min-w-0">
      <LiveColumnTitle column={column} count={entries.length} id={id} level="h3" />
      <div className="mt-2 flex flex-col gap-2">
        {entries.map((entry) => (
          <LiveEntryCard
            key={entry.session.id}
            entry={entry}
            {...list}
            // Working asks nothing of you yet: a line each
            options={{ row: column === "working" }}
          />
        ))}
        {entries.length === 0 && (
          <p className="text-label text-muted-foreground">
            {column === "attention" ? liveMessages().nothingOnYou : todayMessages().nothingWorking}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * The sessions left open with nothing happening, folded behind their name and count: they ask
 * nothing of you, but a forgotten one is worth finding. Absent when there is none.
 */
function IdleGroup({ entries, ...list }: EntryList & { entries: LiveEntry[] }) {
  // Open from the start when the drawer shows one of them, so the selected card stays on screen
  const [open, setOpen] = useState(() => entries.some((e) => e.session.id === list.selectedId));
  if (entries.length === 0) return null;
  const t = todayMessages();
  return (
    <section aria-labelledby="today-idle" className="min-w-0">
      <LiveColumnTitle column="idle" count={entries.length} id="today-idle" level="h3" />
      <p className="text-label text-muted-foreground">
        {liveMessages().idleNote(IDLE_AFTER_MS / MINUTE)}
      </p>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {entries.map((entry) => (
            <LiveEntryCard key={entry.session.id} entry={entry} {...list} />
          ))}
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-1 -ml-2.5"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight className={cn("transition-transform", open && "rotate-90")} aria-hidden />
        {open ? t.hideIdle : t.showIdle(entries.length)}
      </Button>
    </section>
  );
}
