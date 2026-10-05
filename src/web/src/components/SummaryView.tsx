import type { Artifact, CalendarSession, Project, Recap, Usage } from "@shared/api.ts";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { useRecaps, useRequestRecap } from "@/hooks/queries.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { listMessages } from "@/i18n/messages/list.tsx";
import { summaryMessages } from "@/i18n/messages/summary.ts";
import { projectColor } from "@/lib/colors.ts";
import {
  dateLabel,
  durationLabel,
  HOUR,
  hhmm,
  isSameDay,
  type View,
  weekday,
} from "@/lib/dates.ts";
import type { SegmentMatch } from "@/lib/filter.ts";
import { costLabel, numberLabel, tokensLabel } from "@/lib/format.ts";
import { issueBaseUrl } from "@/lib/issueLinks.ts";
import type { DayBlock } from "@/lib/layout.ts";
import {
  type PeriodSummary,
  type ProjectSummary,
  sessionsUntil,
  summarize,
} from "@/lib/summary.ts";
import { cn } from "@/lib/utils.ts";
import { Hint } from "./Hint.tsx";
import { Markdown } from "./Markdown.tsx";
import { SEGMENT, SEGMENTED } from "./Toolbar.tsx";

interface Props {
  view: View;
  /** The shown period [from, to). Recaps are stored per period. */
  from: number;
  to: number;
  days: number[];
  sessions: CalendarSession[];
  /** The period before, for the change under each number. null while it loads. */
  previous: { days: number[]; sessions: CalendarSession[] } | null;
  projects: Map<number, Project>;
  /** The same filter as the calendar and list, so all three add up the same blocks. */
  matches: SegmentMatch;
  selectedId: string | null;
  selectedAt: number | null;
  now: number;
  onSelect: (id: string, at: number) => void;
  onOpenDay: (day: number) => void;
  /** Overview / table switch, placed at the top of the content rather than on a bar of its own. */
  tabs: React.ReactNode;
}

/**
 * The period at a glance: totals with the change from the period before, where the time went
 * (by day or through the day, and by project), and the blocks themselves grouped by project.
 * Blocks open in the drawer like on the calendar.
 */
export function SummaryView({
  view,
  from,
  to,
  days,
  sessions,
  previous,
  projects,
  matches,
  selectedId,
  selectedAt,
  now,
  onSelect,
  onOpenDay,
  tabs,
}: Props) {
  const summary = useMemo(() => summarize(days, sessions, matches), [days, sessions, matches]);
  // While the period is running, compare with the previous one up to the same point. Minutes are
  // enough, so the comparison isn't redone every time `now` ticks
  const soFar = now >= from && now < to;
  const elapsed = soFar ? Math.floor((now - from) / 60_000) * 60_000 : null;
  const before = useMemo(() => {
    if (!previous) return null;
    const start = previous.days[0] ?? 0;
    const list =
      elapsed === null ? previous.sessions : sessionsUntil(previous.sessions, start + elapsed);
    return summarize(previous.days, list, matches);
  }, [previous, matches, elapsed]);
  const recapList = useRecaps(from, to, true).data?.recaps;
  const recaps = useMemo(
    () => new Map((recapList ?? []).map((r) => [r.projectId, r])),
    [recapList],
  );
  const requestRecap = useRequestRecap();
  const onRecap = (projectId: number) => requestRecap.mutate({ projectId, from, to });
  const m = summaryMessages();
  // Keep the tabs when there's nothing to sum up, so the table stays one click away
  if (summary.blocks === 0 && summary.busyMs === 0)
    return <div className="mx-auto w-full max-w-5xl px-6 pt-4">{tabs}</div>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <section
        aria-label={m.region(view)}
        className="mx-auto flex max-w-5xl flex-col gap-8 px-6 pt-4 pb-16"
      >
        <div className="-mb-2">{tabs}</div>
        <Totals view={view} soFar={soFar} summary={summary} before={before} />
        {view === "week" ? (
          <ByDay summary={summary} projects={projects} now={now} onOpenDay={onOpenDay} />
        ) : (
          <ThroughDay
            day={days[0] ?? 0}
            summary={summary}
            projects={projects}
            onSelect={onSelect}
          />
        )}
        <ByProject summary={summary} projects={projects} />
        <Done
          view={view}
          summary={summary}
          projects={projects}
          recaps={recaps}
          onRecap={onRecap}
          requestError={requestRecap.error?.message ?? null}
          selectedId={selectedId}
          selectedAt={selectedAt}
          onSelect={onSelect}
        />
      </section>
    </div>
  );
}

/**
 * Overview or table. The table is the per-block list with sortable numbers; it keeps its own
 * scroll and sticky header, so it replaces the overview rather than sitting inside it. The switch
 * sits in the first line of either, not on a bar of its own under the toolbar.
 */
export function SummaryTabs({
  table,
  onTable,
}: {
  table: boolean;
  onTable: (table: boolean) => void;
}) {
  const m = summaryMessages();
  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0.5}
      className={SEGMENTED}
      value={table ? "table" : "overview"}
      onValueChange={(v) => v && onTable(v === "table")}
      aria-label={m.tabs}
    >
      <ToggleGroupItem value="overview" className={SEGMENT} title={`${m.overview} (s)`}>
        {m.overview}
      </ToggleGroupItem>
      <ToggleGroupItem value="table" className={SEGMENT} title={`${m.table} (l)`}>
        {m.table}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 font-medium text-muted-foreground text-xs">{children}</h2>;
}

const projectName = (projects: Map<number, Project>, id: number | null) =>
  (id !== null ? projects.get(id)?.name : undefined) ?? formatMessages().unknownProject;

const projectOf = (projects: Map<number, Project>, id: number | null) =>
  id !== null ? projects.get(id) : undefined;

/** "+2h 10m" / "−3". The minus is U+2212 so it lines up with the plus in tabular figures. */
function signed(diff: number, label: (n: number) => string): string {
  return `${diff > 0 ? "+" : "−"}${label(Math.abs(diff))}`;
}

const costText = (u: Usage | null) =>
  u ? `${u.unpriced ? "~" : ""}${costLabel(u.costUsd)}` : formatMessages().none;

function Totals({
  view,
  soFar,
  summary: s,
  before: b,
}: {
  view: View;
  soFar: boolean;
  summary: PeriodSummary;
  before: PeriodSummary | null;
}) {
  const m = summaryMessages();
  const l = listMessages();
  // Whether more is better depends on the number (cost), so changes stay neutral in color
  const change = (now: number, then: number | undefined, label: (n: number) => string) => {
    if (then === undefined) return null;
    const diff = now - then;
    return diff === 0 ? m.unchanged(view, soFar) : m.versus(view, signed(diff, label), soFar);
  };
  const minuteRound = (ms: number) => Math.round(ms / 60_000) * 60_000;
  const items: { label: string; value: string; sub: React.ReactNode; hint?: string }[] = [
    {
      label: m.working,
      value: durationLabel(s.busyMs),
      sub: (
        <>
          {s.claudeMs ? (
            <Hint text={m.claudeNote}>
              <span>{m.claude(durationLabel(s.claudeMs))}</span>
            </Hint>
          ) : null}
          <span>
            {change(minuteRound(s.busyMs), b ? minuteRound(b.busyMs) : undefined, durationLabel)}
          </span>
        </>
      ),
    },
    {
      label: m.prs,
      value: numberLabel(s.prs.length),
      sub: change(s.prs.length, b?.prs.length, numberLabel),
    },
    {
      label: m.commits,
      value: numberLabel(s.commits),
      sub: change(s.commits, b?.commits, numberLabel),
    },
    {
      label: m.tokens,
      value: s.usage ? tokensLabel(s.usage.tokens) : formatMessages().none,
      sub: change(s.usage?.tokens ?? 0, b ? (b.usage?.tokens ?? 0) : undefined, tokensLabel),
    },
    {
      label: m.cost,
      value: costText(s.usage),
      hint: s.usage?.unpriced ? l.costNoteUnpriced : l.costNote,
      // Compare whole cents, so float noise never reads as a change
      sub: change(
        Math.round((s.usage?.costUsd ?? 0) * 100),
        b ? Math.round((b.usage?.costUsd ?? 0) * 100) : undefined,
        (n) => costLabel(n / 100),
      ),
    },
  ];
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-y-4">
      {/* Working time leads; the rest is what came of it, so it is set a size smaller */}
      {items.map((it, i) => (
        <div
          key={it.label}
          className="flex min-w-0 flex-col justify-end gap-0.5 border-l pr-2 pl-4"
        >
          <dt className="text-muted-foreground text-xs">
            {it.hint ? <Hint text={it.hint}>{it.label}</Hint> : it.label}
          </dt>
          <dd
            className={cn(
              "font-num font-semibold text-foreground tabular-nums",
              i === 0 ? "text-[1.75rem] leading-9" : "text-xl leading-7",
            )}
          >
            {it.value}
          </dd>
          <dd className="flex min-h-4 flex-col font-num text-[11px] text-muted-foreground leading-4">
            {it.sub}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** One stacked bar per day. Parallel sessions are split by share, so a bar is the day's union. */
function ByDay({
  summary,
  projects,
  now,
  onOpenDay,
}: {
  summary: PeriodSummary;
  projects: Map<number, Project>;
  now: number;
  onOpenDay: (day: number) => void;
}) {
  const m = summaryMessages();
  const max = Math.max(...summary.days.map((d) => d.busyMs), 1);
  return (
    <div>
      <Heading>{m.byDay}</Heading>
      <div className="grid grid-cols-7 gap-2 border-b">
        {summary.days.map((d) => {
          const parts = d.projects.reduce((n, p) => n + p.busyMs, 0) || 1;
          return (
            <button
              key={d.day}
              type="button"
              onClick={() => onOpenDay(d.day)}
              title={dateLabel(d.day)}
              className="group flex h-40 min-w-0 flex-col items-stretch justify-end gap-1 rounded-t-sm px-1 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="font-num text-[11px] text-muted-foreground tabular-nums">
                {d.busyMs > 0 ? durationLabel(d.busyMs) : m.noTime}
              </span>
              <span
                className="flex w-full flex-col-reverse overflow-hidden rounded-t-sm opacity-90 group-hover:opacity-100"
                style={{ height: `${(d.busyMs / max) * 100}%` }}
              >
                {d.projects.map((p) => (
                  <span
                    key={p.projectId ?? "none"}
                    style={{
                      height: `${(p.busyMs / parts) * 100}%`,
                      background: projectColor(projectOf(projects, p.projectId)),
                    }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-2">
        {summary.days.map((d) => (
          <span
            key={d.day}
            className={cn(
              "text-center font-num text-xs",
              isSameDay(d.day, now) ? "text-primary" : "text-muted-foreground",
            )}
          >
            {m.dayTick(weekday(d.day), new Date(d.day).getDate())}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The day's blocks on one line per project, between the first and last hour with work. */
function ThroughDay({
  day,
  summary,
  projects,
  onSelect,
}: {
  day: number;
  summary: PeriodSummary;
  projects: Map<number, Project>;
  onSelect: (id: string, at: number) => void;
}) {
  const m = summaryMessages();
  const rows = summary.projects.map((p) => ({ project: p, blocks: p.clipped }));
  const all = rows.flatMap((r) => r.blocks);
  if (all.length === 0) return null;
  const from = Math.floor(Math.min(...all.map((b) => b.start)) / HOUR);
  const to = Math.ceil(Math.max(...all.map((b) => b.end)) / HOUR);
  const span = Math.max(to - from, 1) * HOUR;
  const hours = Array.from({ length: Math.max(to - from, 1) + 1 }, (_, i) => from + i);
  const left = (t: number) => `${((t - from * HOUR) / span) * 100}%`;
  return (
    <div>
      <Heading>{m.throughDay}</Heading>
      <div className="grid grid-cols-[minmax(6rem,10rem)_1fr] items-center gap-x-3 gap-y-1.5">
        {rows.map(({ project: p, blocks }) => (
          <div key={p.projectId ?? "none"} className="contents">
            <span className="truncate text-sm">{projectName(projects, p.projectId)}</span>
            <div className="relative h-5 rounded-sm bg-muted/60">
              {blocks.map((b) => (
                <button
                  key={`${b.session.id}:${b.segment.start}`}
                  type="button"
                  onClick={() => onSelect(b.session.id, b.segment.start)}
                  title={`${hhmm(b.dayStart + b.start)}–${hhmm(b.segment.end)} ${b.segment.headline}`}
                  className="absolute inset-y-0 min-w-1 rounded-sm opacity-90 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
                  style={{
                    left: left(b.start),
                    width: `calc(${left(b.end)} - ${left(b.start)})`,
                    background: projectColor(projectOf(projects, p.projectId)),
                  }}
                />
              ))}
            </div>
          </div>
        ))}
        <span />
        <div className="relative h-4">
          {hours.map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2 font-num text-[11px] text-muted-foreground"
              style={{ left: left(h * HOUR) }}
            >
              {hhmm(day + h * HOUR)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ByProject({
  summary,
  projects,
}: {
  summary: PeriodSummary;
  projects: Map<number, Project>;
}) {
  const m = summaryMessages();
  const max = Math.max(...summary.projects.map((p) => p.busyMs), 1);
  // Rows count parallel work once per project, the total once overall. Say so when they differ
  const overlap = summary.projects.reduce((n, p) => n + p.busyMs, 0) - summary.busyMs >= 60_000;
  return (
    <div>
      <Heading>{m.byProject}</Heading>
      {overlap && (
        <p className="-mt-2 mb-2 text-muted-foreground text-xs">
          {m.overlap(durationLabel(summary.busyMs))}
        </p>
      )}
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>{m.byProject}</th>
            <td />
            <th>{m.working}</th>
            <th>{m.outcomes}</th>
            <th>{m.cost}</th>
          </tr>
        </thead>
        <tbody>
          {summary.projects.map((p) => (
            <tr key={p.projectId ?? "none"} className="border-t first:border-t-0">
              <th scope="row" className="w-40 max-w-40 truncate py-1.5 pr-3 text-left font-normal">
                {projectName(projects, p.projectId)}
              </th>
              <td className="w-full py-1.5 pr-4" aria-hidden>
                <span
                  className="block h-1.5 rounded-full"
                  style={{
                    width: `${Math.max((p.busyMs / max) * 100, 1)}%`,
                    background: projectColor(projectOf(projects, p.projectId)),
                  }}
                />
              </td>
              <td className="whitespace-nowrap py-1.5 pr-4 text-right font-num tabular-nums">
                {durationLabel(p.busyMs)}
              </td>
              <td className="whitespace-nowrap py-1.5 pr-4 text-right font-num text-muted-foreground tabular-nums">
                {formatMessages().commitsPrs(p.commits, p.prs.length)}
              </td>
              <td className="whitespace-nowrap py-1.5 text-right font-num text-muted-foreground tabular-nums">
                {costText(p.usage)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Done({
  view,
  summary,
  projects,
  recaps,
  onRecap,
  requestError,
  selectedId,
  selectedAt,
  onSelect,
}: {
  view: View;
  summary: PeriodSummary;
  projects: Map<number, Project>;
  recaps: Map<number, Recap>;
  onRecap: (projectId: number) => void;
  /** Why the latest request was refused (e.g. the queue is full). */
  requestError: string | null;
  selectedId: string | null;
  selectedAt: number | null;
  onSelect: (id: string, at: number) => void;
}) {
  const m = summaryMessages();
  const shown = summary.projects.filter((p) => p.blocks.length > 0);
  if (shown.length === 0) return null;
  // Projects whose recap is missing or out of date, in the order shown
  const unwritten = shown.flatMap((p) => {
    const r = p.projectId !== null ? recaps.get(p.projectId) : undefined;
    return r && !r.pending && (!r.body || r.stale) ? [r.projectId] : [];
  });
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-medium text-muted-foreground text-xs">{m.done}</h2>
        {unwritten.length > 1 && (
          <Button variant="ghost" size="xs" onClick={() => unwritten.forEach(onRecap)}>
            <Sparkles />
            {m.recapWriteAll}
          </Button>
        )}
      </div>
      {requestError && (
        <p className="mb-3 text-destructive text-xs" role="alert">
          {m.recapFailed(requestError)}
        </p>
      )}
      <div className="flex flex-col gap-6">
        {shown.map((p) => (
          <ProjectDone
            key={p.projectId ?? "none"}
            view={view}
            project={p}
            projects={projects}
            recap={p.projectId !== null ? recaps.get(p.projectId) : undefined}
            onRecap={onRecap}
            selectedId={selectedId}
            selectedAt={selectedAt}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function ProjectDone({
  view,
  project: p,
  projects,
  recap,
  onRecap,
  selectedId,
  selectedAt,
  onSelect,
}: {
  view: View;
  project: ProjectSummary;
  projects: Map<number, Project>;
  /** Missing for work outside a known project, or when the period's work all started before it. */
  recap: Recap | undefined;
  onRecap: (projectId: number) => void;
  selectedId: string | null;
  selectedAt: number | null;
  onSelect: (id: string, at: number) => void;
}) {
  const color = projectColor(projectOf(projects, p.projectId));
  return (
    <div className="border-l-2 pl-4" style={{ borderColor: color }}>
      <h3 className="mb-1.5 flex items-baseline gap-2 font-medium text-sm">
        {projectName(projects, p.projectId)}
        <span className="font-normal font-num text-muted-foreground text-xs">
          {durationLabel(p.busyMs)}
        </span>
      </h3>
      {recap && (
        <RecapBlock
          recap={recap}
          baseUrl={issueBaseUrl(projectOf(projects, p.projectId)?.repo)}
          onRecap={() => onRecap(recap.projectId)}
        />
      )}
      <ul className="flex flex-col">
        {p.blocks.map((b, i) => (
          <DoneItem
            key={`${b.session.id}:${b.segment.start}`}
            // In the week, name the day only where it changes, so the column reads as a timeline
            showDay={
              view === "week" &&
              !isSameDay(b.segment.start, p.blocks[i - 1]?.segment.start ?? Number.NaN)
            }
            block={b}
            selected={
              b.session.id === selectedId && (selectedAt === null || selectedAt === b.segment.start)
            }
            onSelect={onSelect}
          />
        ))}
      </ul>
    </div>
  );
}

/** The LLM's explanation of the project's work in the period, or a button to write one. */
function RecapBlock({
  recap: r,
  baseUrl,
  onRecap,
}: {
  recap: Recap;
  baseUrl: string | null;
  onRecap: () => void;
}) {
  const m = summaryMessages();
  const error = r.error && !r.pending && (
    <p className="text-destructive text-xs">{m.recapFailed(r.error)}</p>
  );
  if (r.pending)
    return (
      <p className="mb-2 flex items-center gap-1.5 text-muted-foreground text-xs" role="status">
        <Loader2 className="size-3.5 animate-spin" />
        {m.recapWriting}
      </p>
    );
  if (!r.body)
    return (
      <div className="mb-2 flex flex-col items-start gap-1">
        <Hint text={m.recapNote}>
          <Button
            variant="ghost"
            size="xs"
            className="-ml-2 text-muted-foreground"
            onClick={onRecap}
          >
            <Sparkles />
            {m.recapWrite}
          </Button>
        </Hint>
        {error}
      </div>
    );
  return (
    <div className="mb-3 flex flex-col gap-1.5 rounded-md bg-muted/50 px-3 py-2.5">
      <Markdown issueBaseUrl={baseUrl}>{r.body}</Markdown>
      <div className="flex flex-wrap items-center gap-x-3 text-muted-foreground text-xs">
        <Hint text={m.recapNote} focusable>
          <Sparkles className="size-3.5" role="img" aria-label={m.recapAbout} />
        </Hint>
        {r.stale && <span className="text-foreground/80">{m.recapStale}</span>}
        <Button variant="ghost" size="xs" className="-ml-1.5" onClick={onRecap}>
          <RefreshCw />
          {m.recapRewrite}
        </Button>
      </div>
      {error}
    </div>
  );
}

function DoneItem({
  showDay,
  block: b,
  selected,
  onSelect,
}: {
  showDay: boolean;
  block: DayBlock;
  selected: boolean;
  onSelect: (id: string, at: number) => void;
}) {
  const start = b.segment.start;
  return (
    <li
      className={cn(
        "-mx-2 flex items-baseline gap-3 rounded-sm px-2 py-1 hover:bg-accent",
        selected && "bg-accent",
      )}
      data-selected={selected || undefined}
    >
      <span className="flex w-28 shrink-0 gap-1.5 font-num text-muted-foreground text-xs tabular-nums">
        <span className="w-7 shrink-0 text-foreground/80">{showDay && weekday(start)}</span>
        {hhmm(start)}–{hhmm(b.segment.end)}
      </span>
      <button
        type="button"
        onClick={() => onSelect(b.session.id, start)}
        className="min-w-0 flex-1 text-left text-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        {b.segment.headline}
      </button>
      {b.segment.prs.length > 0 && (
        <span className="flex shrink-0 gap-2">
          {b.segment.prs.map((a) => (
            <PrNumber key={a.ref} artifact={a} />
          ))}
        </span>
      )}
    </li>
  );
}

/** Just the number, since the headline beside it already says what the PR was about. */
function PrNumber({ artifact: a }: { artifact: Artifact }) {
  const num = /\/pull\/(\d+)/.exec(a.ref)?.[1];
  return (
    <a
      href={a.ref}
      target="_blank"
      rel="noreferrer"
      title={a.title ?? a.ref}
      className="font-medium font-num text-primary text-xs hover:underline"
    >
      {num ? `#${num}` : a.title || a.ref}
    </a>
  );
}
