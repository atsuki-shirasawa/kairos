// The `Queries` façade behind the API and the CLI: it holds the database, the clock, summary
// progress and the visibility rule, and delegates every query to its domain module. Helpers live
// in those modules; other features import them from there, not from here.
import type { Database } from "bun:sqlite";
import type {
  CalendarSession,
  LedgerEntry,
  MessagesResponse,
  OpenItemUpdate,
  PickUpSession,
  Project,
  ProjectUpdate,
  Recap,
  SessionDetail,
  Span,
} from "../../shared/api.ts";
import { openItemsIn, type UpdateRefusal, updateOpenItem } from "../summarize/ledger/openItems.ts";
import { loadRecapInput, type RecapTarget } from "../summarize/recap.ts";
import { currentVisibility, DEFAULT_HIDDEN_CWDS, visibleSessionSql } from "../visibility.ts";
import { calendarSessions, neighbors, spans } from "./calendar.ts";
import { type MessagesOptions, messagesPage } from "./messages.ts";
import { pickUpSessions } from "./pickUp.ts";
import { updateProject, visibleProjects } from "./projects.ts";
import { projectRecaps } from "./recaps.ts";
import { SEARCH_LIMIT, type SearchResult, searchBlocks } from "./search.ts";
import { hasSection, hasSession, sessionDetail } from "./sessions.ts";
import { NO_SUMMARIES, type SummaryState } from "./summaryState.ts";

/** Read queries behind the API, plus the few writes the UI can make (project settings). */
export class Queries {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now,
    /** Summary progress (answered by the Summarizer). */
    private readonly summaries: SummaryState = NO_SUMMARIES,
    /** Launch directories whose sessions are never shown (see `SessionVisibility`). */
    private readonly hiddenCwds: readonly string[] = DEFAULT_HIDDEN_CWDS,
  ) {}

  /**
   * Condition keeping the sessions the calendar shows, on the sessions table aliased `s`.
   * Read per query, so turning headless sessions on or off applies to the next request.
   */
  private visible(): string {
    return visibleSessionSql(currentVisibility(this.db, this.hiddenCwds));
  }

  /** Projects with visible sessions, for the filter (see `visibleProjects`). */
  projects(): Project[] {
    return visibleProjects(this.db, this.visible());
  }

  /** Applies the given color and visibility changes. Returns the result, or null if absent. */
  updateProject(id: number, update: ProjectUpdate): Project | null {
    return updateProject(this.db, id, update);
  }

  /** Starts of the nearest work blocks before and after [from, to) (from visible sessions). */
  neighbors(from: number, to: number): { prev: number | null; next: number | null } {
    return neighbors(this.db, this.visible(), { from, to });
  }

  /** Times of work blocks overlapping [from, to). Overlap is decided the same way as in `calendar`. */
  spans(from: number, to: number): Span[] {
    return spans(this.db, this.visible(), { from, to });
  }

  /** Recaps for projects with work starting in [from, to), written or not (see `projectRecaps`). */
  recaps(from: number, to: number): Recap[] {
    return projectRecaps(this.db, this.summaries, from, to);
  }

  /** Open items of human work that were open at some point in [from, to), oldest first. */
  openItems(from: number, to: number): LedgerEntry[] {
    return openItemsIn(this.db, from, to);
  }

  /** Recent sessions whose latest summary left items still open (see `pickUpSessions`). */
  pickUp(): PickUpSession[] {
    return pickUpSessions(this.db, this.visible(), this.now());
  }

  /** Closes an open item by hand, or reopens one closed by hand (see `updateOpenItem`). */
  updateOpenItem(id: number, update: OpenItemUpdate): LedgerEntry | UpdateRefusal {
    return updateOpenItem(this.db, id, update, this.now());
  }

  /** Whether the project has work starting in [from, to) to recap. */
  hasRecapWork(target: RecapTarget): boolean {
    return loadRecapInput(this.db, target) !== null;
  }

  /** Visible sessions whose work blocks overlap [from, to). */
  calendar(from: number, to: number): CalendarSession[] {
    return calendarSessions(this.db, this.visible(), { from, to }, this.now());
  }

  /** What the session drawer shows (sections, artifacts, subagents, usage); null if absent. */
  session(id: string): SessionDetail | null {
    return sessionDetail(this.db, id, this.now(), this.summaries);
  }

  /** Whether the session exists, without loading what the drawer shows. */
  hasSession(id: string): boolean {
    return hasSession(this.db, id);
  }

  /** Whether the session exists and has a section starting at `start`. */
  hasSection(id: string, start: number): boolean {
    return hasSection(this.db, id, start);
  }

  /** Work blocks of visible sessions matching every term, newest first (see `searchBlocks`). */
  search(query: string, limit = SEARCH_LIMIT): SearchResult {
    return searchBlocks(this.db, query, this.visible(), limit);
  }

  /** One page of a session's conversation in file order (see `messagesPage`). */
  messages(sessionId: string, opts: MessagesOptions = {}): MessagesResponse {
    return messagesPage(this.db, sessionId, opts);
  }
}
