// Small pieces shared by the summary's sections.
import type { Usage } from "@shared/api.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { approxCostLabel } from "@/lib/format.ts";

/** A section heading of the summary. */
export function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 font-medium text-label text-muted-foreground">{children}</h2>;
}

/** Estimated cost, marked "~" when some models had no known price. */
export const costText = (u: Usage | null) => (u ? approxCostLabel(u) : formatMessages().none);
