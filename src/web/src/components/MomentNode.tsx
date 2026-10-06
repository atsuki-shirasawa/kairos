import { formatMessages } from "@/i18n/messages/format.ts";
import { cn } from "@/lib/utils.ts";
import { Hint } from "./Hint.tsx";

/**
 * The mark for a commit (a ring) or a PR (a filled node), wherever the app shows one. On the
 * calendar it hangs on a block's colored edge like a node on a git graph; elsewhere it stands in
 * for the words, so the same shape means the same thing across the calendar, drawer and lists.
 */
export function MomentNode({
  pr,
  className,
  style,
}: {
  pr: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none inline-block size-[7px] shrink-0 rounded-full border-[1.5px] border-foreground/80",
        pr ? "bg-foreground/80" : "bg-card",
        className,
      )}
      style={style}
      aria-hidden
    />
  );
}

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
