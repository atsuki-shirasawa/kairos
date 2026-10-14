// The props every period body (calendar, month, table, summary) takes. They draw the same data
// differently, so the shape is declared once here rather than per view.
import type { CalendarSession, Project } from "@shared/api.ts";
import type { SegmentMatch } from "./filter.ts";

/** What a view of the shown period draws, and how it reports a pick. */
export interface PeriodBodyProps {
  /** The period's days (midnight). A month's weeks are padded with days of the adjacent months. */
  days: number[];
  /** The period's sessions, hidden projects and quick questions already left out. */
  sessions: CalendarSession[];
  projects: Map<number, Project>;
  selectedId: string | null;
  /** Start of the selected section. When null, every block of that session shows as selected. */
  selectedAt: number | null;
  now: number;
  /**
   * Whether a block passes the keyword and the filter. The grids fade the rest to keep the shape
   * of the day; the table and the summary, read through totals, leave them out.
   */
  matches: SegmentMatch;
  onSelect: (id: string, at: number) => void;
  onOpenDay: (day: number) => void;
}
