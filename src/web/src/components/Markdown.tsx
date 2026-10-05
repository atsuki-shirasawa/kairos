import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils.ts";

/**
 * 会話や要約の Markdown を表示する。生の HTML は描画しない（react-markdown の既定）。
 * 画像は読み込まず、リンクは新しいタブで開く。
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
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
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {c}
            </a>
          ),
          img: ({ alt, src }) => (
            <span className="text-muted-foreground">[画像: {alt || String(src ?? "")}]</span>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
