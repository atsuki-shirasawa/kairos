import type { Section } from "@shared/api.ts";
import { useState } from "react";

/** Where the conversation should scroll to. `key` changes to repeat a jump to the same time. */
export type Jump = { ts: number; key: number };

/**
 * Opens the conversation at the start of `section` (when there is one to jump to). Even when moving
 * to another block while open, the conversation shows from the selected time.
 */
export function useConversationJump(
  section: Section | null,
  onShowConversation: (show: boolean) => void,
): { jump: Jump | null; openConversation: () => void } {
  const [jump, setJump] = useState<Jump | null>(section ? { ts: section.start, key: 0 } : null);
  const openConversation = () => {
    if (section) setJump((j) => ({ ts: section.start, key: (j?.key ?? 0) + 1 }));
    onShowConversation(true);
  };
  return { jump, openConversation };
}
