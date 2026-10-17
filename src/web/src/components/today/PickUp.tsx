import type { PickUpSession, Project } from "@shared/api.ts";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { useOpenItemEdits } from "@/hooks/useOpenItemEdits.ts";
import { todayMessages } from "@/i18n/messages/today.ts";
import type { PickUpList } from "@/lib/pickUp.ts";
import { isSelectedSection, type OpenBlock } from "@/lib/selection.ts";
import { cn } from "@/lib/utils.ts";
import { PickUpCard } from "./PickUpCard.tsx";

/**
 * What is left to pick up: a card per recent session whose latest summary left work open, the best
 * ranked first, a few at most, the rest behind "n more". Nothing while loading.
 */
export function PickUp({
  list,
  projects,
  now,
  selectedId,
  selectedAt,
  onSelect,
}: {
  list: PickUpList | null;
  projects: ReadonlyMap<number, Project>;
  now: number;
  selectedId: string | null;
  selectedAt: number | null;
  onSelect: OpenBlock;
}) {
  const t = todayMessages();
  const [all, setAll] = useState(false);
  const edits = useOpenItemEdits();
  if (!list) return null;
  const empty = list.shown.length === 0;
  const card = (s: PickUpSession) => (
    <PickUpCard
      key={s.sessionId}
      session={s}
      projects={projects}
      now={now}
      selected={isSelectedSection(s, selectedId, selectedAt)}
      onSelect={onSelect}
      edits={edits}
    />
  );
  return (
    <section aria-labelledby="today-pick-up" className="flex min-w-0 flex-col gap-3">
      <h2 id="today-pick-up" className="font-semibold text-title tracking-tight">
        {t.pickUp}
      </h2>
      {empty && <p className="text-body text-muted-foreground">{t.nothingToPickUp}</p>}
      <div className="flex flex-col gap-2">
        {list.shown.map(card)}
        {all && list.more.map(card)}
      </div>
      {list.more.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2.5 self-start"
          aria-expanded={all}
          onClick={() => setAll((a) => !a)}
        >
          <ChevronRight className={cn("transition-transform", all && "rotate-90")} aria-hidden />
          {all ? t.fewer : t.more(list.more.length)}
        </Button>
      )}
    </section>
  );
}
