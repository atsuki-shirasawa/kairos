import type { Project, SearchHit } from "@shared/api.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { searchMessages } from "@/i18n/messages/search.ts";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel, hhmm } from "@/lib/dates.ts";
import { splitHighlights } from "@/lib/search.ts";
import { projectLabel } from "@/lib/selection.ts";

/**
 * One search hit as the search panel and the palette show it: the project's color, the headline,
 * when and where, the field that matched, and a snippet, with the terms marked. The caller makes
 * it a button or an option.
 */
export function HitSummary({
  hit,
  terms,
  project,
}: {
  hit: SearchHit;
  terms: string[];
  project: Project | undefined;
}) {
  const m = searchMessages();
  const f = formatMessages();
  return (
    <>
      <span
        className="w-[3px] shrink-0 self-stretch rounded-full"
        style={{ background: projectColor(project) }}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-1 font-medium text-body">
          <Highlight text={hit.headline} terms={terms} />
        </span>
        <span className="flex min-w-0 gap-2 text-label text-muted-foreground">
          <span className="shrink-0 font-num">
            {dateLabel(hit.start)} {hhmm(hit.start)}
          </span>
          <span className="min-w-0 truncate">
            {projectLabel(project)}
            {hit.label ? f.sessionLabel(hit.label) : ""}
          </span>
          {hit.field !== "headline" && (
            <span className="ml-auto shrink-0 rounded border px-1 text-meta leading-4">
              {m.field[hit.field]}
            </span>
          )}
        </span>
        {hit.snippet && (
          <span className="line-clamp-2 text-label text-muted-foreground leading-relaxed">
            <Highlight text={hit.snippet} terms={terms} />
          </span>
        )}
      </span>
    </>
  );
}

/** Marks every occurrence of the search terms, ignoring case. */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  return splitHighlights(text, terms).map((part, i) =>
    part.match ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string, never reordered
      <mark key={i} className="rounded-sm bg-primary/15 text-inherit">
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  );
}
