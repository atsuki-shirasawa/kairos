import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * 用語や数字の補足。ネイティブの title は出るまで遅く、キーボードでは出ないので、ツールチップで出す。
 * `focusable` を付けると Tab でもたどれる（ドロワーの説明など、数の少ないところで使う）。
 * 表のセルのように数が多いところでは付けず、Tab の止まる先を増やさない。
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
