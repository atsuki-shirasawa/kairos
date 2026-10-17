import type { PickUpSession, Project } from "@shared/api.ts";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Markdown } from "@/components/Markdown.tsx";
import { HandActions, KindTag } from "@/components/OpenItemParts.tsx";
import { ResumeButton } from "@/components/ResumeButton.tsx";
import { Button } from "@/components/ui/button.tsx";
import type { OpenItemEdits } from "@/hooks/useOpenItemEdits.ts";
import { summaryMessages } from "@/i18n/messages/summary.ts";
import { todayMessages } from "@/i18n/messages/today.ts";
import { projectColor } from "@/lib/colors.ts";
import { timeOrDateTime } from "@/lib/dates.ts";
import { issueBaseUrl } from "@/lib/issueLinks.ts";
import { failureAmong } from "@/lib/openItems.ts";
import { waitingCount } from "@/lib/pickUp.ts";
import { type OpenBlock, projectName, projectOf } from "@/lib/selection.ts";
import { cn } from "@/lib/utils.ts";

/**
 * One session to pick up: where it stopped (its latest block's headline, which opens the block),
 * the step it was about to take, how many items wait on you, and a button copying the command that
 * resumes it. Its open items unfold below (`PickUpItems`).
 */
export function PickUpCard({
  session: s,
  projects,
  now,
  selected,
  onSelect,
  edits,
}: {
  session: PickUpSession;
  projects: ReadonlyMap<number, Project>;
  now: number;
  selected: boolean;
  onSelect: OpenBlock;
  edits: OpenItemEdits;
}) {
  const t = todayMessages();
  const [open, setOpen] = useState(false);
  const project = projectOf(projects, s.projectId);
  const waiting = waitingCount(s);
  const baseUrl = issueBaseUrl(project?.repo);
  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-r-md rounded-l-[3px] border border-l-[3px] border-l-[var(--c)] px-3 py-2.5",
        selected && "outline-2 outline-primary",
      )}
      style={{ "--c": projectColor(project) } as React.CSSProperties}
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <h3 className="min-w-0 font-medium text-body">
            <button
              type="button"
              onClick={() => onSelect(s.sessionId, s.start)}
              aria-pressed={selected}
              className="line-clamp-2 text-left hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {s.headline}
            </button>
          </h3>
          <span className="ml-auto shrink-0 font-num text-label text-muted-foreground">
            {timeOrDateTime(s.lastActive, now)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-label text-muted-foreground">
          {projectName(projects, s.projectId)}
        </p>
      </div>
      {s.next && (
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 text-label text-muted-foreground">{t.next}</span>
          <Markdown issueBaseUrl={baseUrl} className="line-clamp-2 min-w-0 flex-1 leading-normal">
            {s.next}
          </Markdown>
        </div>
      )}
      <div className="flex items-center gap-2 text-label">
        <Button
          variant="ghost"
          size="xs"
          className="-ml-2 text-muted-foreground"
          aria-expanded={open}
          aria-label={t.openItemsOf(s.items.length, s.headline)}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronRight className={cn("transition-transform", open && "rotate-90")} aria-hidden />
          {t.openItems(s.items.length)}
        </Button>
        {waiting > 0 && <span className="text-warn">{t.waiting(waiting)}</span>}
        <span className="ml-auto">
          <ResumeButton sessionId={s.sessionId} cwd={s.launchCwd} />
        </span>
      </div>
      {open && <PickUpItems session={s} baseUrl={baseUrl} edits={edits} />}
    </article>
  );
}

/** A session's open items, each with its kind and the hand closes, and why the last close failed. */
function PickUpItems({
  session: s,
  baseUrl,
  edits,
}: {
  session: PickUpSession;
  /** Where `#123` in item text links to, from the project's repository. */
  baseUrl: string | null;
  edits: OpenItemEdits;
}) {
  const failure = failureAmong(s.items, edits.failure);
  return (
    <>
      <ul aria-label={todayMessages().itemsOf(s.headline)} className="flex flex-col">
        {s.items.map((item) => (
          <li key={item.id} className="flex items-baseline gap-3 py-0.5">
            <KindTag item={item} />
            <Markdown issueBaseUrl={baseUrl} className="min-w-0 flex-1 leading-normal">
              {item.text}
            </Markdown>
            <HandActions item={item} busy={edits.busyId === item.id} onUpdate={edits.onUpdate} />
          </li>
        ))}
      </ul>
      {failure && (
        <p className="text-destructive text-label" role="alert">
          {summaryMessages().openUpdateFailed(failure)}
        </p>
      )}
    </>
  );
}
