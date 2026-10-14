import type { Message } from "@shared/api.ts";
import { useEffect, useRef } from "react";
import type { Jump } from "./useConversationJump.ts";
import type { PagedQuery } from "./useLoadMoreOnScroll.ts";

/**
 * Scrolls to the first message at or after `jump.ts`, fetching more pages until it is loaded.
 * Each jump runs once per change of its `key`, so scrolling away afterwards isn't undone.
 */
export function useJumpToMessage(messages: Message[], jump: Jump | null, query: PagedQuery): void {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const jumped = useRef<number | null>(null);
  useEffect(() => {
    if (!jump || jumped.current === jump.key || messages.length === 0) return;
    const target = jumpTarget(messages, jump.ts);
    if (!target) {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
      return;
    }
    const el = document.getElementById(`msg-${target.id}`);
    if (!el) return;
    jumped.current = jump.key;
    // The jump can be long, so skip smooth scrolling
    el.scrollIntoView({ block: "start" });
  }, [jump, messages, hasNextPage, isFetchingNextPage, fetchNextPage]);
}

/** The first message shown at or after `ts`. Tool results sit inside their call, so they aren't one. */
function jumpTarget(messages: Message[], ts: number): Message | undefined {
  return messages.find((m) => m.kind !== "tool_result" && m.ts !== null && m.ts >= ts);
}
