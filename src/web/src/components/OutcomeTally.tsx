import { formatMessages } from "@/i18n/messages/format.ts";
import { cn } from "@/lib/utils.ts";
import { Hint } from "./Hint.tsx";
import { MomentNode } from "./MomentNode.tsx";

/**
 * Commit and PR counts as nodes rather than words, for lines that must stay short (day headers,
 * the drawer's figures, table cells). The words are on hover.
 */
export function OutcomeTally({
  commits,
  prs,
  className,
}: {
  commits: number;
  prs: number;
  className?: string;
}) {
  return (
    <Hint
      text={formatMessages().commitsPrs(commits, prs)}
      className={cn("inline-flex items-center gap-2", className)}
    >
      {commits > 0 && (
        <span className="inline-flex items-center gap-1">
          <MomentNode pr={false} />
          {commits}
        </span>
      )}
      {prs > 0 && (
        <span className="inline-flex items-center gap-1">
          <MomentNode pr />
          {prs}
        </span>
      )}
    </Hint>
  );
}
