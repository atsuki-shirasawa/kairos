// What the search panel lists and which words it marks in the results.
import type { SearchHit } from "@shared/api.ts";
import { isProjectShown } from "@shared/projects.ts";

/** Hits to list: hidden projects stay hidden in search too. */
export function visibleHits<T extends Pick<SearchHit, "projectId">>(
  hits: readonly T[],
  projects: ReadonlyMap<number, { hidden: boolean }>,
): T[] {
  return hits.filter((h) => isProjectShown(projects, h.projectId));
}

/** The words to mark in results: the query's terms, with a `file:` prefix taken off its path. */
export function highlightTerms(query: string): string[] {
  return query.split(/\s+/).map((t) => t.replace(/^file:/i, ""));
}

/** A piece of a result's text, and whether it is one of the search terms. */
export interface HighlightPart {
  text: string;
  match: boolean;
}

/**
 * Splits `text` around every occurrence of the terms, ignoring case, in order. Pieces between
 * matches can be empty strings; without any terms the text is one piece.
 */
export function splitHighlights(text: string, terms: readonly string[]): HighlightPart[] {
  const words = terms.filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (words.length === 0) return [{ text, match: false }];
  // The terms are one capture group, so the matches land on the odd indexes
  return text
    .split(new RegExp(`(${words.join("|")})`, "gi"))
    .map((part, i) => ({ text: part, match: i % 2 === 1 }));
}
