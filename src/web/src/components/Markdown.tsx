import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { conversationMessages } from "@/i18n/messages/conversation.ts";
import { remarkIssueLinks } from "@/lib/issueLinks.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Renders Markdown from conversations and summaries. Raw HTML is never rendered (react-markdown's default).
 * Images are not loaded, and links open in a new tab.
 * With `issueBaseUrl`, `#123` in the text links to that repository's issue / PR.
 */
export function Markdown({
  children,
  className,
  issueBaseUrl,
}: {
  children: string;
  className?: string;
  issueBaseUrl?: string | null;
}) {
  return (
    <div
      className={cn(
        "space-y-2 break-words text-sm leading-relaxed",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold",
        "[&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2",
        "[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={
          issueBaseUrl ? [remarkGfm, [remarkIssueLinks, { baseUrl: issueBaseUrl }]] : [remarkGfm]
        }
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {c}
            </a>
          ),
          img: ({ alt, src }) => (
            <span className="text-muted-foreground">
              {conversationMessages().image(alt || String(src ?? ""))}
            </span>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
