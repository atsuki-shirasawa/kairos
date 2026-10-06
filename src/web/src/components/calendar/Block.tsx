import type { CalendarSession, Project } from "@shared/api.ts";
import { useId } from "react";
import { Markdown } from "@/components/Markdown.tsx";
import { MomentNode } from "@/components/MomentNode.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { calendarMessages } from "@/i18n/messages/calendar.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import {
  type BlockGeometry,
  blockGeometry,
  blockMoments,
  headingLines,
  isLastSegment,
  type Moment,
  type MomentRow,
  momentMarks,
  momentRows,
} from "@/lib/calendarGrid.ts";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel, durationLabel, hhmm } from "@/lib/dates.ts";
import { artifactRef } from "@/lib/drawer.ts";
import type { PlacedBlock } from "@/lib/layout.ts";
import { cn } from "@/lib/utils.ts";
import { INDENT_PX, LINE_CLAMP } from "./constants.ts";

/** Blocks at least this tall (and this uncovered) have room for the time range line. */
const META_MIN_PX = 52;
/** Height the time range line takes under the heading (its line plus the gap above it). */
const META_ROW_PX = 18;
/** In the day view, blocks with this much visible height also show the summary body. */
const BODY_MIN_PX = 96;
/** Commits and PRs the tooltip lists before summing the rest as "+n more". */
const TOOLTIP_MOMENTS = 6;
/**
 * Commits and PRs read out to screen readers before summing the rest. A busy morning can hold a
 * dozen or more, and hearing every subject on each block would bury the block's own label.
 */
const SPOKEN_MOMENTS = 8;
/** Height of one label in the day view's lane of commits and PRs. */
const LANE_ROW_PX = 18;
/**
 * Width of that lane. The day view is wide enough that a block's text would otherwise run across
 * the whole screen; the right side holds the moments instead, and the text keeps a readable measure.
 */
const LANE_WIDTH = "min(38%, 24rem)";
/**
 * Room the heading, time range and body leave for the lane, matching `LANE_WIDTH` plus a gap.
 * Both this and the lane switch on the block's own width (a container query): side-by-side or
 * stacked blocks on a busy day are too narrow for it, and fall back to the tooltip.
 * Spelled out so Tailwind can pick up the class names.
 */
const LANE_ROOM = "@min-[36rem]:pr-[calc(min(38%,24rem)+0.75rem)]";

/** How a block reads, apart from its position. */
interface BlockState {
  selected: boolean;
  faded: boolean;
  /** Not summarized yet, so the heading is the raw first prompt. */
  dim: boolean;
  short: boolean;
  depth: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** A work block in a day column, with its tooltip. Clicking it selects that section. */
export function Block({
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
  const { session, segment } = block;
  const geo = blockGeometry(block, hourPx);
  const label = segment.headline;
  const range = timeRange(block);
  const working = session.active && isLastSegment(block);
  // Before summarizing, the heading is the raw first prompt ("sorry, meant for another session", etc.),
  // which is noise next to summarized work. Tone down background and text. In-progress work is
  // just waiting for its summary, so it is excluded
  const dim = !segment.summarized && !working;
  // In the day view a tall block has room to be read without opening the drawer
  const body = detailed && geo.visible >= BODY_MIN_PX ? segment.body : null;
  const { commits, prs } = segment.activity;
  const projectName = project?.name ?? formatMessages().unknownProject;
  const state: BlockState = { ...block, selected, faded, dim, short: geo.short };
  // In the week view the block's position on the grid already tells the time, so the range line
  // only repeats it; it stays for the selected block, and the tooltip always has it
  const meta = (detailed || selected) && geo.height >= META_MIN_PX && geo.visible >= META_MIN_PX;
  // The heading only gets the lines left after the time range, or the two would overlap
  const lines = geo.short
    ? 1
    : body
      ? 2
      : meta
        ? headingLines(geo.visible - META_ROW_PX)
        : geo.lines;
  const moments = blockMoments(block, hourPx, geo.filledPx);
  // Two rows at least: a lane with room for only "+n more" says nothing the tooltip doesn't
  const lane = detailed && moments.length > 0 && geo.visible >= 2 * LANE_ROW_PX;
  const momentsId = useId();

  return (
    <Tooltip>
      {/* The button fills the block and sits on top, so the block can hold Markdown (lists etc.),
          which is not allowed inside a button. The visible content below is never interactive */}
      <div className={blockClassName(state)} style={blockStyle(block, geo, project, selected)}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onSelect(session.id, segment.start)}
            aria-pressed={selected}
            data-selected={selected || undefined}
            aria-label={calendarMessages().blockAria(
              label,
              projectName,
              dateLabel(block.dayStart),
              range,
            )}
            aria-describedby={moments.length > 0 ? momentsId : undefined}
            className="absolute inset-0 z-[1] outline-none"
          />
        </TooltipTrigger>
        <MomentsDescription id={momentsId} moments={moments} />
        {geo.stretched && <UnfilledEdge filledPx={geo.filledPx} />}
        <BlockHeading
          label={label}
          bold={!dim || selected}
          short={geo.short}
          lines={lines}
          room={lane}
        />
        {meta && <BlockMeta block={block} range={range} detailed={detailed} room={lane} />}
        {body && <BlockBody body={body} room={lane} />}
        <MomentTicks moments={moments} filledPx={geo.filledPx} />
        {lane && (
          <MomentLane rows={momentRows(moments, LANE_ROW_PX, geo.visible)} heightPx={geo.visible} />
        )}
        {working && <WorkingDot />}
      </div>
      <BlockTooltip
        label={label}
        projectName={projectName}
        session={session}
        range={range}
        durationMs={block.end - block.start}
        commits={commits}
        prs={prs}
        moments={moments}
        faded={faded}
        dim={dim}
      />
    </Tooltip>
  );
}

/** "10:00–11:30", or a single time when the block starts and ends in the same minute. */
export function timeRange(block: PlacedBlock): string {
  const from = hhmm(block.dayStart + block.start);
  const to = hhmm(block.dayStart + block.end);
  return from === to ? from : `${from}–${to}`;
}

/** Classes of the block's frame: fill, outline and fading by state. */
function blockClassName({
  selected,
  faded,
  dim,
  short,
  depth,
  continuesBefore,
  continuesAfter,
}: BlockState): string {
  return cn(
    // Pale background with a strong left edge. Kept quieter than the time column gradient
    "@container group absolute flex flex-col gap-0.5 overflow-hidden rounded-r-md rounded-l-[3px] border-l-[3px] pr-1.5 pl-2.5",
    short ? "py-px" : "py-1",
    // Stacked blocks get a base-colored outline to separate them from the one below
    depth > 0 && "shadow-[0_0_0_1px_var(--card)]",
    // The fill is a variable painted over the real length only (see `blockStyle`). Mixing into an
    // achromatic base in oklch keeps each project's hue (see --block-base)
    dim
      ? "text-muted-foreground [--fill:color-mix(in_oklch,var(--c)_var(--mix-block-dim),var(--block-base))]"
      : "text-foreground [--fill:color-mix(in_oklch,var(--c)_var(--mix-block),var(--block-base))]",
    "has-[>button:hover]:[--fill:color-mix(in_oklch,var(--c)_var(--mix-block-hover),var(--block-base))]",
    // The outline alone marks the selection; a deeper fill on top said the same thing twice
    selected && "text-foreground",
    "has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:outline-ring has-[>button:focus-visible]:outline-offset-1",
    // Indigo is the app's one mark for "selected", here as everywhere else
    selected && "outline-2 outline-primary outline-offset-1",
    continuesBefore && "rounded-t-none",
    continuesAfter && "rounded-b-none",
    // Non-matching blocks keep only their shape. Restore them on hover/focus and when selected so they stay readable
    faded &&
      !selected &&
      "opacity-30 transition-opacity has-[>button:focus-visible]:opacity-100 has-[>button:hover]:opacity-100 motion-reduce:transition-none",
  );
}

/** Position, stacking and project color of the block's frame. */
function blockStyle(
  { col, cols, span, depth }: PlacedBlock,
  { top, height, stretched, filledPx }: BlockGeometry,
  project: Project | undefined,
  selected: boolean,
): React.CSSProperties {
  return {
    top,
    height,
    left: `calc(${(col / cols) * 100}% + ${2 + depth * INDENT_PX}px)`,
    width: `calc(${(span / cols) * 100}% - ${4 + depth * INDENT_PX}px)`,
    // Later blocks draw on top. Even when selected, a block never hides the ones stacked over it
    zIndex: 1 + depth * 2 + (selected ? 1 : 0),
    borderLeftColor: "var(--c)",
    "--c": projectColor(project),
    backgroundImage: "linear-gradient(var(--fill), var(--fill))",
    backgroundSize: `100% ${stretched ? `${filledPx}px` : "100%"}`,
    backgroundRepeat: "no-repeat",
    // The label area gets a faint fill, so the block keeps its card shape instead of looking cut
    // off after a few pixels. It is opaque, which also hides any block stacked underneath
    backgroundColor: stretched
      ? "color-mix(in oklch, var(--fill) 40%, var(--block-base))"
      : undefined,
  } as React.CSSProperties;
}

/**
 * The left edge of a stretched block's unfilled part. Drawn over the border (left: -3px), so that
 * part gets a faint edge instead of the strong one.
 */
function UnfilledEdge({ filledPx }: { filledPx: number }) {
  return (
    <span
      className="absolute bottom-0 -left-[3px] w-[3px]"
      style={{ top: filledPx, background: "color-mix(in oklch, var(--c) 35%, var(--card))" }}
      aria-hidden
    />
  );
}

/** The block's heading, clamped to the lines that fit. */
function BlockHeading({
  label,
  bold,
  short,
  lines,
  room,
}: {
  label: string;
  bold: boolean;
  short: boolean;
  lines: number;
  /** Leave room on the right for the day view's lane. */
  room: boolean;
}) {
  return (
    <span
      className={cn(
        // Long ASCII words ("CLAUDE.md") break inside narrow lanes rather than being cut off
        // It keeps its lines instead of shrinking under the time range below it
        "shrink-0 text-xs [overflow-wrap:anywhere]",
        bold ? "font-medium" : "font-normal",
        short ? "leading-4" : "leading-snug",
        LINE_CLAMP[lines],
        room && LANE_ROOM,
      )}
    >
      {label}
    </span>
  );
}

/** The time range under the heading; in the day view also the worktree label. */
function BlockMeta({
  block,
  range,
  detailed,
  room,
}: {
  block: PlacedBlock;
  range: string;
  detailed: boolean;
  /** Leave room on the right for the day view's lane. */
  room: boolean;
}) {
  const { session } = block;
  return (
    <span
      className={cn(
        "flex min-w-0 shrink-0 items-center gap-1.5 font-num text-[11px] text-muted-foreground",
        room && LANE_ROOM,
      )}
    >
      <span className="shrink-0">{range}</span>
      {/* Several sessions of one project share a color, so the worktree tells them apart */}
      {detailed && session.label && <span className="truncate">{session.label}</span>}
    </span>
  );
}

/** The summary body, faded out at the bottom where the block cuts it off. */
function BlockBody({ body, room }: { body: string; room: boolean }) {
  return (
    // The fade spans about two lines, so a cut-off line reads as "continues" rather than as a glitch
    <div
      className={cn(
        "min-h-0 max-w-[72ch] flex-1 overflow-hidden text-foreground [mask-image:linear-gradient(to_bottom,black_calc(100%-2.75rem),transparent)]",
        room && LANE_ROOM,
      )}
    >
      <Markdown plain className="mt-1 space-y-1 text-xs leading-relaxed [&_li+li]:mt-0.5">
        {body}
      </Markdown>
    </div>
  );
}

/**
 * Nodes on the block's colored edge at the moment each commit or PR was made: where a stretch of
 * work turned into something. Read like a git graph, the edge is the branch and each commit a
 * node on it; a PR, the bigger milestone, is a filled node. Moments made in quick succession
 * share one longer pill (`momentMarks`). They hang just inside the edge: the block clips its
 * content at the border, so a node centered on it would be cut in half.
 */
function MomentTicks({ moments, filledPx }: { moments: Moment[]; filledPx: number }) {
  return momentMarks(moments, filledPx).map((mark) => (
    <MomentNode
      key={mark.top}
      pr={mark.pr}
      className="absolute left-0"
      style={{ top: mark.top, height: mark.height }}
    />
  ));
}

/**
 * The day view's lane on the right of a block, labeling each commit and PR at the height it was
 * made. The drawer lists the same outcomes, so this is visual only.
 */
function MomentLane({ rows, heightPx }: { rows: MomentRow[]; heightPx: number }) {
  return (
    // Only as tall as the part no block is stacked over, so it never shows through between them
    <div
      className="pointer-events-none absolute top-0 right-2 @max-[36rem]:hidden border-foreground/10 border-l"
      style={{ width: LANE_WIDTH, height: heightPx }}
      aria-hidden
    >
      {rows.map((row) => (
        <div
          key={row.kind === "more" ? "more" : `${row.moment.artifact.ref}-${row.top}`}
          className="absolute inset-x-0 flex items-center gap-2 pl-2.5 font-num text-[11px] text-muted-foreground"
          style={{ top: row.top, height: LANE_ROW_PX }}
        >
          {row.kind === "more" ? (
            <span>{calendarMessages().moreMoments(row.count)}</span>
          ) : (
            <MomentLabel moment={row.moment} />
          )}
        </div>
      ))}
    </div>
  );
}

/** One commit or PR in the lane or the tooltip: its node, time, short SHA or PR number, and title. */
function MomentLabel({ moment: { artifact } }: { moment: Moment }) {
  const pr = artifact.kind === "pr";
  const ref = artifactRef(artifact);
  return (
    <>
      <MomentNode pr={pr} />
      <span className="shrink-0">{artifact.ts !== null ? hhmm(artifact.ts) : ""}</span>
      {ref && <span className={cn("shrink-0", pr && "font-medium text-foreground")}>{ref}</span>}
      {artifact.title && (
        <span className="truncate font-sans text-foreground">{artifact.title}</span>
      )}
    </>
  );
}

/**
 * The block's commits and PRs as text for screen readers, which the nodes and lane (drawn for the
 * eye only) would otherwise leave out. The block's button points at it with aria-describedby.
 */
function MomentsDescription({ id, moments }: { id: string; moments: Moment[] }) {
  if (moments.length === 0) return null;
  const m = calendarMessages();
  const more = moments.length - SPOKEN_MOMENTS;
  const text = moments
    .slice(0, SPOKEN_MOMENTS)
    .map(({ artifact: a }) =>
      m.momentAria(a.kind === "pr", a.ts !== null ? hhmm(a.ts) : "", artifactRef(a), a.title),
    )
    .concat(more > 0 ? [m.moreMoments(more)] : [])
    .join(m.momentSeparator);
  return (
    <span id={id} className="sr-only">
      {text}
    </span>
  );
}

/** A pulsing dot marking the work still in progress. */
function WorkingDot() {
  return (
    <span
      className="absolute right-1.5 bottom-1.5 size-1.5 animate-pulse rounded-full bg-[var(--c)] motion-reduce:animate-none"
      title={formatMessages().working}
    />
  );
}

/**
 * The block's tooltip: heading, project, time and results, and why it looks faded or dim. Marks
 * (short work drawn on the column's edge) share it, since for them it is the only text shown.
 */
export function BlockTooltip({
  label,
  projectName,
  session,
  range,
  durationMs,
  commits,
  prs,
  moments,
  faded,
  dim,
}: {
  label: string;
  projectName: string;
  session: CalendarSession;
  range: string;
  durationMs: number;
  commits: number;
  prs: number;
  moments: Moment[];
  faded: boolean;
  dim: boolean;
}) {
  const m = calendarMessages();
  const f = formatMessages();
  return (
    <TooltipContent side="right" className="max-w-72 flex-col items-start gap-0.5">
      <p className="font-medium">{label}</p>
      <p className="opacity-70">
        {projectName}
        {session.label ? f.sessionLabel(session.label) : ""}
      </p>
      <p className="font-num opacity-70">{m.rangeDuration(range, durationLabel(durationMs))}</p>
      {moments.length > 0 ? (
        <TooltipMoments moments={moments} />
      ) : (
        (commits > 0 || prs > 0) && <p className="opacity-70">{f.commitsPrs(commits, prs)}</p>
      )}
      {faded && <p className="opacity-70">{m.notMatching}</p>}
      {dim && <p className="opacity-70">{m.notSummarized}</p>}
    </TooltipContent>
  );
}

/**
 * The block's commits and PRs in the tooltip, one per line. In the week view this is the only
 * place their titles show without opening the drawer.
 */
function TooltipMoments({ moments }: { moments: Moment[] }) {
  const shown = moments.slice(0, TOOLTIP_MOMENTS);
  const more = moments.length - shown.length;
  return (
    // The tooltip inverts the theme, so the nodes take its colors instead of the page's
    <ul className="mt-1 w-full space-y-0.5 font-num [--card:var(--popover-foreground)] [--foreground:var(--background)]">
      {shown.map((moment, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a ref can repeat (a commit amended in place)
        <li key={i} className="flex min-w-0 items-center gap-1.5">
          <MomentLabel moment={moment} />
        </li>
      ))}
      {more > 0 && <li className="opacity-70">{calendarMessages().moreMoments(more)}</li>}
    </ul>
  );
}
