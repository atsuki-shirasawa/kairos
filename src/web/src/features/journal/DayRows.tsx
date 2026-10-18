import type { Project } from "@shared/api.ts";
import { journalMessages } from "@/i18n/messages/journal.ts";
import { durationLabel } from "@/lib/dates.ts";
import type { DayBlock } from "@/lib/dayBlocks.ts";
import type { DayRow, LaneLook, LaneMark } from "@/lib/dayRows.ts";
import type { SegmentMatch } from "@/lib/filter.ts";
import { groupLead, groupMatches, isGroupSelected, projectOf } from "@/lib/selection.ts";
import { BlockRow } from "./BlockRow.tsx";
import { Lanes } from "./Lanes.tsx";

/**
 * One day's work as a list in time order, with a lane per session beside it (see `dayRows`): the
 * day page's list, and each day of a thread's.
 */
export function DayRows({
  label,
  rows,
  looks,
  projects,
  selectedId,
  selectedAt,
  matches,
  onSelect,
}: {
  /** The list's name, for screen readers. */
  label: string;
  rows: DayRow[];
  looks: ReadonlyMap<string, LaneLook>;
  projects: Map<number, Project>;
  selectedId: string | null;
  selectedAt: number | null;
  matches: SegmentMatch;
  onSelect: (id: string, at: number) => void;
}) {
  return (
    <ol aria-label={label} className="py-2">
      {rows.map((row) =>
        row.kind === "quiet" ? (
          <QuietRow key={rowKey(row)} ms={row.ms} lanes={row.lanes} looks={looks} />
        ) : (
          <BlockRow
            key={rowKey(row)}
            runs={row.blocks}
            lead={groupLead(row.blocks, matches) ?? (row.blocks[0] as DayBlock)}
            lanes={row.lanes}
            looks={looks}
            project={projectOf(projects, row.blocks[0]?.session.projectId ?? null)}
            selected={isGroupSelected(row.blocks, selectedId, selectedAt)}
            faded={!groupMatches(row.blocks, matches)}
            onSelect={onSelect}
          />
        ),
      )}
    </ol>
  );
}

/** A row's key: its first block, or for a quiet row when it ends. */
function rowKey(row: DayRow): string {
  if (row.kind === "quiet") return `quiet@${row.until}`;
  const lead = row.blocks[0];
  return `${lead?.session.id}@${lead?.segment.start}@${lead?.dayStart}`;
}

/** A stretch with no work, as one line; the sessions still going on pass through it. */
function QuietRow({
  ms,
  lanes,
  looks,
}: {
  ms: number;
  lanes: LaneMark[];
  looks: ReadonlyMap<string, LaneLook>;
}) {
  return (
    <li className="flex pr-4 pl-3">
      <Lanes marks={lanes} looks={looks} />
      <span className="ml-1.5 px-2.5 py-2 font-num text-meta text-muted-foreground">
        {journalMessages().quiet(durationLabel(ms))}
      </span>
    </li>
  );
}
