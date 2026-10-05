import { drawerMessages } from "@/i18n/messages/drawer.ts";
import type { SummaryFailureKind } from "@/lib/drawer.ts";

/**
 * What to do next about a failed `claude -p` run. Shared by section summaries and recaps, which
 * fail for the same reasons.
 */
export function failureHint(kind: SummaryFailureKind): string {
  const t = drawerMessages();
  const hints: Record<SummaryFailureKind, string> = {
    login: t.hintLogin,
    noClaude: t.hintNoClaude,
    timeout: t.hintTimeout,
    rateLimit: t.hintRateLimit,
    other: t.hintOther,
  };
  return hints[kind];
}
