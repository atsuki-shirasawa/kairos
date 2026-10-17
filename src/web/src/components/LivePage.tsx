import type { LiveResponse, LiveSession, Project } from "@shared/api.ts";
import { MINUTE } from "@shared/dates.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { liveMessages } from "@/i18n/messages/live.ts";
import {
  groupByColumn,
  IDLE_AFTER_MS,
  LIVE_COLUMNS,
  type LiveColumn as LiveColumnId,
  type LiveEntry,
  liveCardView,
} from "@/lib/live.ts";
import { projectOf } from "@/lib/selection.ts";
import { cn } from "@/lib/utils.ts";
import { LiveCard } from "./live/LiveCard.tsx";
import { TokenBand } from "./live/TokenBand.tsx";

/**
 * The page of Claude Code sessions running now, in three columns: what waits on you, what is
 * working, and what was left idle. Each card is a small work block with what the log says about
 * the session's current state and tokens; clicking it opens the latest work block in the drawer.
 * A band above the columns shows the tokens all sessions use.
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
  // Tokens come from the logs, so the band stays when the registry can't be read
  const band = <TokenBand tokens={live.tokens} projects={projects} />;
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
        {LIVE_COLUMNS.map((column) => (
          <LiveColumn
            key={column}
            column={column}
            entries={byColumn.get(column) ?? []}
            projects={projects}
            now={now}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

/** One column of the page: its header, then a card per session, or a line saying it is empty. */
function LiveColumn({
  column,
  entries,
  projects,
  now,
  selectedId,
  onSelect,
}: {
  column: LiveColumnId;
  entries: LiveEntry[];
  projects: ReadonlyMap<number, Project>;
  now: number;
  selectedId: string | null;
  onSelect: (session: string, at: number) => void;
}) {
  const m = liveMessages();
  return (
    <section aria-labelledby={`live-${column}`} className="min-w-0">
      <ColumnHeader column={column} count={entries.length} />
      <div className="mt-3 flex flex-col gap-2">
        {entries.map(({ session: s, display }) => {
          const project = projectOf(projects, s.projectId);
          return (
            <LiveCard
              key={s.id}
              card={liveCardView(s, display, project, now)}
              project={project}
              now={now}
              selected={s.id === selectedId}
              onSelect={onSelect}
            />
          );
        })}
        {entries.length === 0 && (
          <p className="text-label text-muted-foreground">
            {column === "attention" ? m.nothingOnYou : formatMessages().none}
          </p>
        )}
      </div>
    </section>
  );
}

/** A column's name and count, with what puts a session there. */
function ColumnHeader({ column, count }: { column: LiveColumnId; count: number }) {
  const m = liveMessages();
  return (
    <header>
      <h2 id={`live-${column}`} className="flex items-baseline gap-2 font-medium text-body">
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
      <p className="text-label text-muted-foreground">
        {column === "idle" ? m.columnNote.idle(IDLE_AFTER_MS / MINUTE) : m.columnNote[column]}
      </p>
    </header>
  );
}

/**
 * A message in place of the columns (nothing running, or the registry can't be read), under the
 * token band.
 */
function PageNote({ band, children }: { band: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      {band}
      <div className="flex flex-1 items-center justify-center px-4">
        <p className="max-w-md text-center text-body text-muted-foreground" role="status">
          {children}
        </p>
      </div>
    </div>
  );
}
