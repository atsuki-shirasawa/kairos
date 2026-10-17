import { cn } from "@/lib/utils.ts";

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
