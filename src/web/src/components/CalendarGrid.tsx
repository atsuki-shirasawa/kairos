import type { CalendarSession, Project } from "@shared/api.ts";
import { ArrowDown, ArrowUp, GitCommitHorizontal, GitPullRequest } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { calendarMessages } from "@/i18n/messages/calendar.ts";
import { dateMessages } from "@/i18n/messages/dates.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { projectColor } from "@/lib/colors.ts";
import { DAY, dateLabel, durationLabel, HOUR, hhmm, isSameDay, weekday } from "@/lib/dates.ts";
import type { SegmentMatch } from "@/lib/filter.ts";
import { costLabel, tokensLabel, troubleCount } from "@/lib/format.ts";
import { busyMs, columnTracks, layoutDay, MIN_BLOCK_MS, type PlacedBlock } from "@/lib/layout.ts";
import { selectedSegment } from "@/lib/navigation.ts";
import { reveal } from "@/lib/reveal.ts";
import { counted, totalsOf } from "@/lib/totals.ts";
import { cn } from "@/lib/utils.ts";

/** Minimum height of an hour. Any lower and headings of short blocks become unreadable. */
const MIN_HOUR_PX = 48;
/** Hours shown on open. The hour height is chosen so this range fits the screen, and it is centered. */
const VIEW_START = 8;
const VIEW_END = 20;
const GUTTER = "3.5rem";
const GUTTER_PX = 56;
/** Right offset for stacked blocks, so the colored left edge of the block below stays visible. */
const INDENT_PX = 8;
/** Spelled out per line count so Tailwind can pick up the class names. */
const LINE_CLAMP = ["", "line-clamp-1", "line-clamp-2", "line-clamp-3"] as const;

interface Props {
  days: number[];
  sessions: CalendarSession[];
  projects: Map<number, Project>;
  selectedId: string | null;
  /** Start of the selected section. When null, every block of that session shows as selected. */
  selectedAt: number | null;
  now: number;
  /** Whether a block matches the filter. Non-matching blocks are faded, not removed, to keep the shape of the day. */
  matches: SegmentMatch;
  onSelect: (id: string, at: number) => void;
  onOpenDay: (day: number) => void;
}

/** Hint for blocks scrolled out of view (above or below). */
interface Edge {
  count: number;
  /** Time of the nearest block (for display), and the scroll position that brings it into view. */
  time: number;
  scrollTo: number;
}

export function CalendarGrid({
  days,
  sessions,
  projects,
  selectedId,
  selectedAt,
  now,
  matches,
  onSelect,
  onOpenDay,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { hourPx, viewportPx, widthPx } = useGridSize(scrollRef);
  const columns = useMemo(() => days.map((day) => layoutDay(sessions, day)), [days, sessions]);
  const firstDay = days[0] ?? 0;

  // Scroll the selected block into view if it's off screen (after switching from the list, moving with j / k, etc.)
  const revealSelected = useCallback(() => {
    const el = scrollRef.current?.querySelector("[data-selected]");
    reveal(scrollRef.current, el ?? null);
  }, []);

  // When the period changes, center the middle of the shown hours on screen.
  // Redo it when the height changes too (the first scroll uses a provisional height before measuring)
  // biome-ignore lint/correctness/useExhaustiveDependencies: also run when the period (firstDay) changes
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    const center = ((VIEW_START + VIEW_END) / 2) * hourPx;
    scrollRef.current.scrollTop = Math.max(0, center - viewportPx / 2);
    revealSelected();
  }, [firstDay, hourPx, viewportPx, revealSelected]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run only when the selection changes
  useLayoutEffect(revealSelected, [selectedId, selectedAt, revealSelected]);

  // Work outside the shown hours (late night, early morning) is easy to miss, so hint at it on the top/bottom edge
  const [edges, setEdges] = useState<{ above: Edge | null; below: Edge | null }>({
    above: null,
    below: null,
  });
  const measureEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    const bottom = top + el.clientHeight;
    const y0 = (b: PlacedBlock) => (b.start / HOUR) * hourPx;
    const y1 = (b: PlacedBlock) =>
      y0(b) + (Math.max(b.end - b.start, MIN_BLOCK_MS) / HOUR) * hourPx;
    const all = columns.flat();
    // Compared across days, so use times since midnight. Jump to the one nearest the view
    const above = all.filter((b) => y1(b) <= top + 4).sort((a, b) => b.end - a.end);
    const below = all.filter((b) => y0(b) >= bottom - 4).sort((a, b) => a.start - b.start);
    const a = above[0];
    const b = below[0];
    const next = {
      above: a ? { count: above.length, time: a.dayStart + a.end, scrollTo: y0(a) - 24 } : null,
      below: b
        ? { count: below.length, time: b.dayStart + b.start, scrollTo: y0(b) - el.clientHeight / 4 }
        : null,
    };
    setEdges((prev) =>
      sameEdge(prev.above, next.above) && sameEdge(prev.below, next.below) ? prev : next,
    );
  }, [columns, hourPx]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: measure again when the height changes
  useLayoutEffect(measureEdges, [measureEdges, viewportPx]);

  // Days with parallel work get more width, days without work (e.g. after today) get narrow.
  // With the drawer open, the selected day keeps its width if lanes would get too narrow
  const focusIndex = useMemo(() => {
    const seg = selectedSegment(sessions, selectedId, selectedAt);
    if (!seg || days.length <= 3) return -1;
    const t = Math.max(seg.start, firstDay);
    return days.findIndex((d) => isSameDay(d, t));
  }, [sessions, selectedId, selectedAt, days, firstDay]);
  const lanes = columns.map((c) => Math.max(0, ...c.map((b) => b.cols)));
  const tracks = columnTracks(lanes, widthPx - GUTTER_PX, focusIndex);
  const template = { gridTemplateColumns: `${GUTTER} ${tracks.join(" ")}` };
  // Animate column width changes so it's easy to follow which day widened
  const animate = "transition-[grid-template-columns] duration-200 motion-reduce:transition-none";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      {/* Both rows reserve the scrollbar's width, so the header's day columns line up with the body's */}
      <div
        className={cn("grid overflow-y-hidden border-b [scrollbar-gutter:stable]", animate)}
        style={template}
      >
        <div />
        {days.map((day, i) => (
          <DayHeader
            key={day}
            day={day}
            // Day totals count only work that matches the filter
            blocks={(columns[i] ?? []).filter((b) => matches(b.session, b.segment))}
            today={isSameDay(day, now)}
            onOpen={() => onOpenDay(day)}
          />
        ))}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
          onScroll={measureEdges}
        >
          <div className={cn("grid", animate)} style={{ ...template, height: 24 * hourPx }}>
            <div className="relative" aria-hidden>
              {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
                <span
                  key={h}
                  className="absolute right-2 -translate-y-1/2 font-num text-[11px] text-muted-foreground"
                  style={{ top: h * hourPx }}
                >
                  {h}:00
                </span>
              ))}
            </div>

            {days.map((day, i) => (
              <DayColumn
                key={day}
                day={day}
                detailed={days.length === 1}
                blocks={columns[i] ?? []}
                hourPx={hourPx}
                projects={projects}
                selectedId={selectedId}
                selectedAt={selectedAt}
                now={now}
                matches={matches}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
        {edges.above && (
          <EdgeButton
            edge={edges.above}
            where="above"
            onClick={(top) => scrollRef.current?.scrollTo({ top, behavior: "smooth" })}
          />
        )}
        {edges.below && (
          <EdgeButton
            edge={edges.below}
            where="below"
            onClick={(top) => scrollRef.current?.scrollTo({ top, behavior: "smooth" })}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Day header. Below the date, one line with the day's working time and results (a short form of the
 * list's daily totals). Other numbers (blocks, Claude time, tokens, cost, snags) go to the tooltip so
 * the calendar doesn't fill up with numbers. Narrow columns (e.g. with the drawer open) show only line 1.
 */
function DayHeader({
  day,
  blocks,
  today,
  onOpen,
}: {
  day: number;
  blocks: PlacedBlock[];
  today: boolean;
  onOpen: () => void;
}) {
  const d = new Date(day);
  const busy = busyMs(blocks);
  const { usage, activity } = totalsOf(blocks);
  const commits = activity?.commits ?? 0;
  const prs = activity?.prs ?? 0;
  const trouble = activity ? troubleCount(activity) : 0;
  const m = calendarMessages();
  const f = formatMessages();

  const button = (
    <button
      type="button"
      onClick={onOpen}
      className="@container flex min-h-14 min-w-0 flex-col justify-center overflow-hidden border-l px-2.5 py-1 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      aria-label={m.openDay(dateLabel(day))}
    >
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        {/* Show the month on the 1st only, so a month change mid-week stands out */}
        {d.getDate() === 1 && (
          <span className="font-num text-muted-foreground text-xs">
            {dateMessages().monthShort(d.getMonth())}
          </span>
        )}
        {/* Circle today's number in indigo (the familiar calendar-app mark) */}
        <span
          className={cn(
            "font-num font-semibold text-lg leading-7",
            today
              ? "inline-flex size-7 items-center justify-center self-center rounded-full bg-primary text-primary-foreground"
              : "text-foreground",
          )}
        >
          {d.getDate()}
        </span>
        <span className={cn("text-xs", today ? "text-primary" : "text-muted-foreground")}>
          {weekday(day)}
        </span>
      </span>
      {blocks.length > 0 && (
        <span className="@min-[6.5rem]:flex hidden items-center gap-2 whitespace-nowrap font-num text-[11px] text-muted-foreground leading-4">
          <span className="text-foreground/80">{durationLabel(busy)}</span>
          {commits > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <GitCommitHorizontal className="size-3" />
              {commits}
            </span>
          )}
          {prs > 0 && (
            <span className="inline-flex items-center gap-0.5 text-primary">
              <GitPullRequest className="size-3" />
              {prs}
            </span>
          )}
          {/* Only when wide (as in the day view), add the block count. Cost stays in the tooltip */}
          <span className="@min-[20rem]:inline hidden">
            {f.blocks(blocks.filter(counted).length)}
          </span>
        </span>
      )}
    </button>
  );
  if (blocks.length === 0) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom" className="flex-col items-start gap-0.5 font-num">
        <p className="font-medium">{dateLabel(day)}</p>
        <p className="opacity-80">
          {m.blocksWork(f.blocks(blocks.filter(counted).length), durationLabel(busy))}
          {activity?.claudeMs ? m.claudeTotal(durationLabel(activity.claudeMs)) : ""}
        </p>
        {usage && (
          <p className="opacity-80">
            {m.tokensCost(
              tokensLabel(usage.tokens),
              `${usage.unpriced ? "~" : ""}${costLabel(usage.costUsd)}`,
            )}
          </p>
        )}
        {(commits > 0 || prs > 0 || trouble > 0) && (
          <p className="opacity-80">
            {f.commitsPrs(commits, prs)}
            {trouble > 0 && `${f.separator}${f.trouble(trouble)}`}
          </p>
        )}
        <p className="opacity-60">{m.clickForDay}</p>
      </TooltipContent>
    </Tooltip>
  );
}

const sameEdge = (a: Edge | null, b: Edge | null) =>
  a === b || (a !== null && b !== null && a.count === b.count && a.time === b.time);

function EdgeButton({
  edge,
  where,
  onClick,
}: {
  edge: Edge;
  where: "above" | "below";
  onClick: (top: number) => void;
}) {
  const Icon = where === "above" ? ArrowUp : ArrowDown;
  const m = calendarMessages();
  const text =
    where === "above"
      ? m.edgeAbove(hhmm(edge.time), edge.count)
      : m.edgeBelow(hhmm(edge.time), edge.count);
  return (
    <button
      type="button"
      onClick={() => onClick(Math.max(0, edge.scrollTo))}
      className={cn(
        "absolute left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border bg-popover px-3 py-1 font-num text-muted-foreground text-xs shadow-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
        where === "above" ? "top-2" : "bottom-2",
      )}
      aria-label={m.edgeAria(where === "above", text)}
    >
      <Icon className="size-3" />
      {text}
    </button>
  );
}

/**
 * Derives the hour height from the scroll area: just enough for the shown hours to fit, but never
 * below the minimum on short screens. Re-measures when the window resizes.
 * The width tells whether opening the drawer made the columns narrow.
 */
function useGridSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ hourPx: MIN_HOUR_PX, viewportPx: 0, widthPx: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const viewportPx = el.clientHeight;
      const widthPx = el.clientWidth;
      const hourPx = Math.max(MIN_HOUR_PX, viewportPx / (VIEW_END - VIEW_START));
      setSize((prev) =>
        prev.hourPx === hourPx && prev.viewportPx === viewportPx && prev.widthPx === widthPx
          ? prev
          : { hourPx, viewportPx, widthPx },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function DayColumn({
  day,
  detailed,
  blocks,
  hourPx,
  projects,
  selectedId,
  selectedAt,
  now,
  matches,
  onSelect,
}: {
  day: number;
  /** Day view: wide blocks also show the summary body and PRs. */
  detailed: boolean;
  blocks: PlacedBlock[];
  hourPx: number;
  projects: Map<number, Project>;
  selectedId: string | null;
  selectedAt: number | null;
  now: number;
  matches: SegmentMatch;
  onSelect: (id: string, at: number) => void;
}) {
  const today = now >= day && now < day + DAY;
  return (
    <div
      className={cn("relative min-w-0 border-l", today && "bg-primary/[0.04]")}
      style={{
        backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${hourPx}px)`,
      }}
    >
      {/* Draw the current-time line under the blocks, so it doesn't hide a short block just before it */}
      {today && (
        <div
          className="pointer-events-none absolute inset-x-0 h-0.5 bg-primary"
          style={{ top: ((now - day) / HOUR) * hourPx }}
          aria-hidden
        >
          <span className="absolute -top-[3px] -left-1 size-2 rounded-full bg-primary" />
        </div>
      )}
      {blocks.map((b) => (
        <Block
          key={`${b.session.id}-${b.start}`}
          block={b}
          detailed={detailed}
          hourPx={hourPx}
          project={b.session.projectId !== null ? projects.get(b.session.projectId) : undefined}
          selected={
            b.session.id === selectedId && (selectedAt === null || b.segment.start === selectedAt)
          }
          faded={!matches(b.session, b.segment)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function Block({
  block,
  detailed,
  hourPx,
  project,
  selected,
  faded,
  onSelect,
}: {
  block: PlacedBlock;
  detailed: boolean;
  hourPx: number;
  project: Project | undefined;
  selected: boolean;
  faded: boolean;
  onSelect: (id: string, at: number) => void;
}) {
  const { session, segment, start, end, col, cols, span, depth } = block;
  const height = (Math.max(end - start, MIN_BLOCK_MS) / HOUR) * hourPx - 2;
  // Tighten the padding on short blocks so one line fits even at the minimum height (MIN_BLOCK_MS)
  const short = height < 34;
  // If another block covers this one, fit the heading into the part still visible
  const visible =
    block.coveredFrom === null ? height : ((block.coveredFrom - start) / HOUR) * hourPx;
  const lines = Math.max(1, Math.min(3, Math.floor((visible - 8) / 16.5)));
  const label = segment.headline;
  const range = `${hhmm(block.dayStart + start)}–${hhmm(block.dayStart + end)}`;
  const working = session.active && isLastSegment(block);
  // Before summarizing, the heading is the raw first prompt ("sorry, meant for another session", etc.),
  // which is noise next to summarized work. Tone down background and text. In-progress work is
  // just waiting for its summary, so it is excluded
  const dim = !segment.summarized && !working;
  // In the day view a tall block has room to be read without opening the drawer
  const body = detailed && visible >= 96 ? segment.body : null;
  const { commits, prs } = segment.activity;
  const m = calendarMessages();
  const f = formatMessages();
  const projectName = project?.name ?? f.unknownProject;

  return (
    <Tooltip>
      {/* The button fills the block and sits on top, so the block can hold Markdown (lists etc.),
          which is not allowed inside a button. The visible content below is never interactive */}
      <div
        className={cn(
          // Pale background with a strong left edge. Kept quieter than the time column gradient
          "@container group absolute flex flex-col gap-0.5 overflow-hidden rounded-r-md rounded-l-[3px] border-l-[3px] pr-1.5 pl-1.5",
          short ? "py-px" : "py-1",
          // Stacked blocks get a base-colored outline to separate them from the one below
          depth > 0 && "shadow-[0_0_0_1px_var(--card)]",
          // Mixing in oklab keeps hues from turning gray on the dark navy background
          dim
            ? "bg-[color-mix(in_oklab,var(--c)_var(--mix-block-dim),var(--card))] text-muted-foreground"
            : "bg-[color-mix(in_oklab,var(--c)_var(--mix-block),var(--card))] text-foreground",
          "has-[>button:hover]:bg-[color-mix(in_oklab,var(--c)_var(--mix-block-hover),var(--card))]",
          selected &&
            "bg-[color-mix(in_oklab,var(--c)_var(--mix-block-selected),var(--card))] text-foreground",
          "has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:outline-ring has-[>button:focus-visible]:outline-offset-1",
          selected && "outline-2 outline-foreground outline-offset-1",
          block.continuesBefore && "rounded-t-none",
          block.continuesAfter && "rounded-b-none",
          // Non-matching blocks keep only their shape. Restore them on hover/focus and when selected so they stay readable
          faded &&
            !selected &&
            "opacity-30 transition-opacity has-[>button:focus-visible]:opacity-100 has-[>button:hover]:opacity-100 motion-reduce:transition-none",
        )}
        style={
          {
            top: (start / HOUR) * hourPx + 1,
            height,
            left: `calc(${(col / cols) * 100}% + ${2 + depth * INDENT_PX}px)`,
            width: `calc(${(span / cols) * 100}% - ${4 + depth * INDENT_PX}px)`,
            // Later blocks draw on top. Even when selected, a block never hides the ones stacked over it
            zIndex: 1 + depth * 2 + (selected ? 1 : 0),
            borderLeftColor: "var(--c)",
            "--c": projectColor(project),
          } as React.CSSProperties
        }
      >
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onSelect(session.id, segment.start)}
            aria-pressed={selected}
            data-selected={selected || undefined}
            aria-label={m.blockAria(label, projectName, dateLabel(block.dayStart), range)}
            className="absolute inset-0 z-[1] outline-none"
          />
        </TooltipTrigger>
        <span
          className={cn(
            "text-xs",
            dim && !selected ? "font-normal" : "font-medium",
            short ? "leading-4" : "leading-snug",
            LINE_CLAMP[short ? 1 : body ? 2 : lines],
          )}
        >
          {label}
        </span>
        {height >= 52 && visible >= 52 && (
          <span className="flex min-w-0 items-center gap-1.5 font-num text-[11px] text-muted-foreground">
            <span className="shrink-0">{range}</span>
            {/* Several sessions of one project share a color, so the worktree tells them apart */}
            {detailed && session.label && <span className="truncate">{session.label}</span>}
            {detailed && prs > 0 && <PrChips block={block} />}
          </span>
        )}
        {body && (
          <div className="min-h-0 flex-1 overflow-hidden text-foreground/85 [mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]">
            <Markdown plain className="mt-1 space-y-1 text-xs leading-relaxed [&_li+li]:mt-0.5">
              {body}
            </Markdown>
          </div>
        )}
        {/* What came out of it, so the work that shipped stands out among blocks of one color */}
        {!short && !detailed && (commits > 0 || prs > 0) && (
          <span className="absolute right-1.5 bottom-1 flex @max-[5rem]:hidden items-center gap-1 font-num text-[10px] text-muted-foreground">
            {prs > 0 && <GitPullRequest className="size-3 text-primary" />}
            {commits > 0 && <GitCommitHorizontal className="size-3" />}
            {working && <span className="w-1.5" />}
          </span>
        )}
        {working && (
          <span
            className="absolute right-1.5 bottom-1.5 size-1.5 animate-pulse rounded-full bg-[var(--c)] motion-reduce:animate-none"
            title={f.working}
          />
        )}
      </div>
      <TooltipContent side="right" className="max-w-72 flex-col items-start gap-0.5">
        <p className="font-medium">{label}</p>
        <p className="opacity-80">
          {projectName}
          {session.label ? f.sessionLabel(session.label) : ""}
        </p>
        <p className="font-num opacity-80">
          {m.rangeDuration(range, durationLabel(block.end - block.start))}
        </p>
        {(commits > 0 || prs > 0) && <p className="opacity-80">{f.commitsPrs(commits, prs)}</p>}
        {faded && <p className="opacity-60">{m.notMatching}</p>}
        {dim && <p className="opacity-60">{m.notSummarized}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

/** PR numbers of a block, as plain labels (the block itself is the button). */
function PrChips({ block }: { block: PlacedBlock }) {
  return (
    <span className="flex min-w-0 shrink items-center gap-1 overflow-hidden text-primary">
      <GitPullRequest className="size-3 shrink-0" />
      {block.segment.prs.map((a) => (
        <span key={a.ref} className="shrink-0">
          #{/\/pull\/(\d+)/.exec(a.ref)?.[1] ?? "?"}
        </span>
      ))}
    </span>
  );
}

/** Whether this is the session's last work block (only it gets the "in progress" mark). */
function isLastSegment(block: PlacedBlock): boolean {
  const last = Math.max(...block.session.segments.map((g) => g.end));
  return block.segment.end >= last && block.dayStart + block.end >= block.segment.end;
}
