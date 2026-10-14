// What the summarizer works on: a section, and how to summarize it. Kept apart from the DB code so
// the store, the ledger and the queue can all name a section without importing one another.

/**
 * `summary` writes a headline and a body; `title` writes only a headline.
 * Short sections have too little in them for a body, so automatic runs give them only a headline.
 */
export type Mode = "summary" | "title";

/** A section (identified by session and start time) and how to summarize it. */
export interface Target {
  sessionId: string;
  start: number;
  mode: Mode;
}

/** A section, identified by its session and start time. */
export type SectionRef = Pick<Target, "sessionId" | "start">;
