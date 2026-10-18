import { Markdown } from "@/components/Markdown.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * How Markdown inside the summary is set, structured or not: bold at the app's semibold and room
 * between list items, so a summary looks the same whether or not it parses.
 */
const SUMMARY_MARKDOWN = "[&_li+li]:mt-1 [&_li>ol]:mt-1 [&_li>ul]:mt-1 [&_strong]:font-semibold";

/**
 * Summary text as Markdown, with issue references linked to the project's repository. Every piece
 * of a summary goes through here so they share the summary's Markdown settings; `className` sets
 * the size and leading of the piece, and `clamped` cuts it to two lines.
 */
export function SummaryMarkdown({
  baseUrl,
  className,
  clamped = false,
  children,
}: {
  baseUrl: string | null;
  className: string;
  clamped?: boolean;
  children: string;
}) {
  return (
    <Markdown
      issueBaseUrl={baseUrl}
      className={cn(className, SUMMARY_MARKDOWN, clamped && "line-clamp-2")}
    >
      {children}
    </Markdown>
  );
}

/** A label over one of the summary's items, in the drawer's small heading style. */
export function SummaryLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-1 font-semibold text-label text-muted-foreground tracking-wide">
      {children}
    </h4>
  );
}
