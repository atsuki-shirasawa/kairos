import type { Project } from "@shared/api.ts";
import { useId } from "react";
import { MomentNode } from "@/components/MomentNode.tsx";
import { StatusDot } from "@/components/ui/status-dot.tsx";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { calendarMessages } from "@/i18n/messages/calendar.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { blockContent } from "@/lib/blockContent.ts";
import { momentsSpeech, tooltipFacts } from "@/lib/blockFacts.ts";
import {
  type BlockGeometry,
  blockGeometry,
  RAISED_LAYER,
  stackOrder,
} from "@/lib/blockGeometry.ts";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel } from "@/lib/dates.ts";
import type { PlacedBlock } from "@/lib/layout.ts";
import { blockMoments, type Moment, momentMarks } from "@/lib/moments.ts";
import { isDim, isWorkingHere } from "@/lib/selection.ts";
import { cn } from "@/lib/utils.ts";
import { BlockTooltip } from "./BlockTooltip.tsx";
import { CARD_FILL, FADED } from "./blockFills.ts";
import { INDENT_PX, LINE_CLAMP } from "./constants.ts";

/**
 * Commits and PRs read out to screen readers before summing the rest. A busy morning can hold a
 * dozen or more, and hearing every subject on each block would bury the block's own label.
 */
const SPOKEN_MOMENTS = 8;
/** How a block reads, apart from its position. */
interface BlockState {
  selected: boolean;
  faded: boolean;
  /** Faded and not selected: drawn see-through, under the blocks in full view. */
  muted: boolean;
  /** Not summarized yet, so the heading is the raw first prompt. */
  dim: boolean;
  /** A headless run (claude -p / SDK), not work you prompted. */
  headless: boolean;
  short: boolean;
  depth: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** A work block in a day column, with its tooltip. Clicking it selects that section. */
export function Block({
  block,
  hourPx,
  project,
  selected,
  faded,
  onSelect,
}: {
  block: PlacedBlock;
  hourPx: number;
  project: Project | undefined;
  selected: boolean;
  faded: boolean;
  onSelect: (id: string, at: number) => void;
}) {
  const { session, segment } = block;
  const geo = blockGeometry(block, hourPx);
  const inProgress = isWorkingHere(block);
  const dim = isDim(block);
  const moments = blockMoments(block, hourPx, geo.filledPx);
  const { meta, lines } = blockContent(geo, { selected });
  const facts = tooltipFacts(block, { project, faded, dim, moments });
  const state: BlockState = {
    ...block,
    selected,
    faded,
    muted: faded && !selected,
    dim,
    headless: session.headless,
    short: geo.short,
  };
  const momentsId = useId();

  return (
    <Tooltip>
      {/* The button fills the block and sits on top, so the block can hold Markdown (lists etc.),
          which is not allowed inside a button. The visible content below is never interactive */}
      <div
        className={blockClassName(state)}
        style={blockStyle(block, geo, project, stackOrder(state))}
      >
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onSelect(session.id, segment.start)}
            aria-pressed={selected}
            data-selected={selected || undefined}
            aria-label={calendarMessages().blockAria(
              facts.label,
              facts.projectName,
              dateLabel(block.dayStart),
              facts.range,
            )}
            aria-describedby={moments.length > 0 ? momentsId : undefined}
            className="absolute inset-0 z-[1] outline-none"
          />
        </TooltipTrigger>
        <MomentsDescription id={momentsId} moments={moments} />
        {geo.stretched && <UnfilledEdge filledPx={geo.filledPx} />}
        <BlockHeading label={facts.label} bold={!dim || selected} short={geo.short} lines={lines} />
        {meta && <BlockMeta range={facts.range} />}
        <MomentTicks moments={moments} filledPx={geo.filledPx} />
        {inProgress && <WorkingDot />}
      </div>
      <BlockTooltip {...facts} />
    </Tooltip>
  );
}

/** Classes of the block's frame: fill, outline and fading by state. */
function blockClassName({
  selected,
  muted,
  dim,
  headless,
  short,
  depth,
  continuesBefore,
  continuesAfter,
}: BlockState): string {
  return cn(
    // Pale background with a strong left edge. Kept quieter than the time column gradient
    "@container group absolute flex flex-col gap-0.5 overflow-hidden rounded-r-md rounded-l-[3px] border-l-[3px] pr-1.5 pl-2.5",
    short ? "py-px" : "py-1",
    // A dashed edge marks a run nobody prompted (claude -p / SDK): still the project's work, so
    // same color and fill, but the solid "branch" edge is kept for your own work
    headless && "border-dashed",
    // Stacked blocks get a base-colored outline to separate them from the one below
    depth > 0 && "shadow-[0_0_0_1px_var(--card)]",
    // The fill is a variable painted over the real length only (see `blockStyle`)
    dim ? CARD_FILL.dim : CARD_FILL.normal,
    CARD_FILL.hover,
    // The outline alone marks the selection; a deeper fill on top said the same thing twice
    selected && "text-foreground",
    "has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:outline-ring has-[>button:focus-visible]:outline-offset-1",
    // Indigo is the app's one mark for "selected", here as everywhere else
    selected && "outline-2 outline-primary outline-offset-1",
    continuesBefore && "rounded-t-none",
    continuesAfter && "rounded-b-none",
    // Stacking order comes from `blockStyle`, as a variable so hover and focus can override it
    "z-(--z)",
    // Non-matching blocks keep only their shape. Restore them on hover/focus and when selected so
    // they stay readable; on hover/focus they also come back above the matching blocks over them
    muted && FADED.card,
  );
}

/** Position, stacking order (see `stackOrder`) and project color of the block's frame. */
function blockStyle(
  { col, cols, span, depth }: PlacedBlock,
  { top, height, stretched, filledPx }: BlockGeometry,
  project: Project | undefined,
  z: number,
): React.CSSProperties {
  return {
    top,
    height,
    left: `calc(${(col / cols) * 100}% + ${2 + depth * INDENT_PX}px)`,
    width: `calc(${(span / cols) * 100}% - ${4 + depth * INDENT_PX}px)`,
    "--z": z,
    "--z-raised": RAISED_LAYER + z,
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
        // It keeps its lines instead of shrinking under the time range below it
        "shrink-0 text-label [overflow-wrap:anywhere]",
        bold ? "font-medium" : "font-normal",
        short ? "leading-4" : "leading-snug",
        LINE_CLAMP[lines],
      )}
    >
      {label}
    </span>
  );
}

/** The time range under the heading. */
function BlockMeta({ range }: { range: string }) {
  return (
    <span className="flex min-w-0 shrink-0 items-center font-num text-meta text-muted-foreground">
      {range}
    </span>
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
 * The block's commits and PRs as text for screen readers, which the nodes and lane (drawn for the
 * eye only) would otherwise leave out. The block's button points at it with aria-describedby.
 */
function MomentsDescription({ id, moments }: { id: string; moments: Moment[] }) {
  if (moments.length === 0) return null;
  return (
    <span id={id} className="sr-only">
      {momentsSpeech(moments, SPOKEN_MOMENTS)}
    </span>
  );
}

/** A pulsing dot marking the work still in progress. */
function WorkingDot() {
  return (
    <StatusDot
      look={{ state: "pulse", tone: "project" }}
      className="absolute right-1.5 bottom-1.5"
      title={formatMessages().working}
    />
  );
}
