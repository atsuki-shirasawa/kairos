import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * A short explanation of a term or number. The native `title` is slow to appear and never shows
 * for keyboard users, so this uses a tooltip instead.
 * `focusable` makes it reachable with Tab (use it where there are few, such as the drawer).
 * Leave it off where there are many, like table cells, so Tab does not stop at every one.
 */
export function Hint({
  text,
  focusable = false,
  className,
  children,
}: {
  text: React.ReactNode;
  focusable?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (!text) return <span className={className}>{children}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={focusable ? 0 : undefined}
          className={cn(
            focusable &&
              "rounded-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
            className,
          )}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{text}</TooltipContent>
    </Tooltip>
  );
}
