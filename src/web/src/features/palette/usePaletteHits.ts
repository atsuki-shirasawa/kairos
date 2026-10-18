import type { Project, SearchHit } from "@shared/api.ts";
import { MIN_SEARCH_CHARS } from "@shared/constants.ts";
import { useMemo } from "react";
import { useSearch } from "@/hooks/queries.ts";
import { visibleHits } from "@/lib/search.ts";

/**
 * Work matching the palette's query across every period, as the search field finds it (same
 * query, same cache), without hidden projects. Searched only while the palette is open, and only
 * the current query's hits: an earlier query's, kept while the next loads, would open the wrong
 * block on Enter.
 */
export function usePaletteHits(
  query: string,
  open: boolean,
  projects: ReadonlyMap<number, Project>,
): { hits: SearchHit[]; loading: boolean } {
  const search = useSearch(query, open);
  const long = [...query.trim()].length >= MIN_SEARCH_CHARS;
  const fresh = long && search.current ? search.data?.hits : undefined;
  const hits = useMemo(() => (fresh ? visibleHits(fresh, projects) : []), [fresh, projects]);
  return { hits, loading: long && !search.current };
}
