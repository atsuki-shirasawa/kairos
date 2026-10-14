import { type RefObject, useEffect } from "react";

/** The paging state of an infinite query that the conversation hooks read. */
export interface PagedQuery {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
}

/**
 * Fetches the next page whenever `sentinel` (an element after the last item) scrolls into view,
 * so reading to the bottom keeps loading without a click.
 */
export function useLoadMoreOnScroll(
  sentinel: RefObject<HTMLElement | null>,
  query: PagedQuery,
): void {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [sentinel, hasNextPage, isFetchingNextPage, fetchNextPage]);
}
