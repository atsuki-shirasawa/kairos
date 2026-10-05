import type { CalendarSession, Project } from "@shared/api.ts";
import { GitCommitHorizontal, GitPullRequest } from "lucide-react";
import { Markdown } from "@/components/Markdown.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { calendarMessages } from "@/i18n/messages/calendar.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { type BlockGeometry, blockGeometry, isLastSegment } from "@/lib/calendarGrid.ts";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel, durationLabel, hhmm } from "@/lib/dates.ts";
import type { PlacedBlock } from "@/lib/layout.ts";
import { cn } from "@/lib/utils.ts";
import { INDENT_PX, LINE_CLAMP } from "./constants.ts";

/** Blocks at least this tall (and this uncovered) have room for the time range line. */
const META_MIN_PX = 52;
/** In the day view, blocks with this much visible height also show the summary body. */
const BODY_MIN_PX = 96;

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
            className="absolute inset-0 z-[1] outline-none"
          />
        </TooltipTrigger>
        {geo.stretched && <UnfilledEdge filledPx={geo.filledPx} />}
        <BlockHeading
          label={label}
          bold={!dim || selected}
          short={geo.short}
          lines={geo.short ? 1 : body ? 2 : geo.lines}
        />
        {geo.height >= META_MIN_PX && geo.visible >= META_MIN_PX && (
          <BlockMeta block={block} range={range} detailed={detailed} />
        )}
        {body && <BlockBody body={body} />}
        {!geo.short && !detailed && (commits > 0 || prs > 0) && (
          <OutcomeIcons commits={commits} prs={prs} working={working} />
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
        faded={faded}
        dim={dim}
      />
    </Tooltip>
  );
}

/** "10:00–11:30", or a single time when the block starts and ends in the same minute. */
function timeRange(block: PlacedBlock): string {
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
    "@container group absolute flex flex-col gap-0.5 overflow-hidden rounded-r-md rounded-l-[3px] border-l-[3px] pr-1.5 pl-1.5",
    short ? "py-px" : "py-1",
    // Stacked blocks get a base-colored outline to separate them from the one below
    depth > 0 && "shadow-[0_0_0_1px_var(--card)]",
    // The fill is a variable painted over the real length only (see `blockStyle`). Mixing into an
    // achromatic base in oklch keeps each project's hue (see --block-base)
    dim
      ? "text-muted-foreground [--fill:color-mix(in_oklch,var(--c)_var(--mix-block-dim),var(--block-base))]"
      : "text-foreground [--fill:color-mix(in_oklch,var(--c)_var(--mix-block),var(--block-base))]",
    "has-[>button:hover]:[--fill:color-mix(in_oklch,var(--c)_var(--mix-block-hover),var(--block-base))]",
    selected &&
      "text-foreground [--fill:color-mix(in_oklch,var(--c)_var(--mix-block-selected),var(--block-base))]",
    "has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:outline-ring has-[>button:focus-visible]:outline-offset-1",
    selected && "outline-2 outline-foreground outline-offset-1",
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
}: {
  label: string;
  bold: boolean;
  short: boolean;
  lines: number;
}) {
  return (
    <span
      className={cn(
        // Long ASCII words ("CLAUDE.md") break inside narrow lanes rather than being cut off
        "text-xs [overflow-wrap:anywhere]",
        bold ? "font-medium" : "font-normal",
        short ? "leading-4" : "leading-snug",
        LINE_CLAMP[lines],
      )}
    >
      {label}
    </span>
  );
}

/** The time range under the heading; in the day view also the worktree label and PR numbers. */
function BlockMeta({
  block,
  range,
  detailed,
}: {
  block: PlacedBlock;
  range: string;
  detailed: boolean;
}) {
  const { session, segment } = block;
  return (
    <span className="flex min-w-0 items-center gap-1.5 font-num text-[11px] text-muted-foreground">
      <span className="shrink-0">{range}</span>
      {/* Several sessions of one project share a color, so the worktree tells them apart */}
      {detailed && session.label && <span className="truncate">{session.label}</span>}
      {detailed && segment.activity.prs > 0 && <PrChips block={block} />}
    </span>
  );
}

/** The summary body, faded out at the bottom where the block cuts it off. */
function BlockBody({ body }: { body: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden text-foreground/85 [mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]">
      <Markdown plain className="mt-1 space-y-1 text-xs leading-relaxed [&_li+li]:mt-0.5">
        {body}
      </Markdown>
    </div>
  );
}

/**
 * Commit and PR icons in the bottom-right corner, so the work that shipped stands out among blocks
 * of one color. Leaves room for the working dot when it is there.
 */
function OutcomeIcons({
  commits,
  prs,
  working,
}: {
  commits: number;
  prs: number;
  working: boolean;
}) {
  return (
    <span className="absolute right-1.5 bottom-1 flex @max-[5rem]:hidden items-center gap-1 font-num text-[10px] text-muted-foreground">
      {prs > 0 && <GitPullRequest className="size-3 text-primary" />}
      {commits > 0 && <GitCommitHorizontal className="size-3" />}
      {working && <span className="w-1.5" />}
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

/** The block's tooltip: heading, project, time and results, and why it looks faded or dim. */
function BlockTooltip({
  label,
  projectName,
  session,
  range,
  durationMs,
  commits,
  prs,
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
  faded: boolean;
  dim: boolean;
}) {
  const m = calendarMessages();
  const f = formatMessages();
  return (
    <TooltipContent side="right" className="max-w-72 flex-col items-start gap-0.5">
      <p className="font-medium">{label}</p>
      <p className="opacity-80">
        {projectName}
        {session.label ? f.sessionLabel(session.label) : ""}
      </p>
      <p className="font-num opacity-80">{m.rangeDuration(range, durationLabel(durationMs))}</p>
      {(commits > 0 || prs > 0) && <p className="opacity-80">{f.commitsPrs(commits, prs)}</p>}
      {faded && <p className="opacity-60">{m.notMatching}</p>}
      {dim && <p className="opacity-60">{m.notSummarized}</p>}
    </TooltipContent>
  );
}
