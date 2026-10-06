import type { Activity, Section, SessionDetail, Usage } from "@shared/api.ts";
import { OutcomeTally } from "@/components/MomentNode.tsx";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import { dateLabel, durationLabel, hhmm, isSameDay, relativeDay } from "@/lib/dates.ts";
import { costLabel, tokensLabel, troubleCount, troubleDetail } from "@/lib/format.ts";
import { Hint } from "../Hint.tsx";

/**
 * When and how long (today / yesterday as words), then the key figures (Claude's time, tokens,
 * cost, outcomes, snags) on a line below. The heading stays put, so stepping with j / k compares
 * them in one place; the breakdown is in "Numbers" below. Figures that are zero are left out.
 */
export function SectionTime({ session: s, section }: { session: SessionDetail; section: Section }) {
  // When on the first line, figures on the second: wrapping one long line used to strand the
  // last figure on a line of its own
  return (
    <div className="mt-2 flex flex-col gap-1 font-num text-muted-foreground text-xs">
      <SectionWhen section={section} active={s.active && section === s.sections.at(-1)} />
      {hasKeyFigures(section) && <KeyFigures usage={section.usage} activity={section.activity} />}
    </div>
  );
}

/** "Today 9:05–10:30", or with the end date when the section crosses midnight. */
function rangeLabel(section: Section): string {
  const day = relativeDay(section.start) ?? dateLabel(section.start);
  return isSameDay(section.start, section.end)
    ? `${day} ${hhmm(section.start)}–${hhmm(section.end)}`
    : `${day} ${hhmm(section.start)} – ${dateLabel(section.end)} ${hhmm(section.end)}`;
}

/** The time range, its length, and a pulse while the session is still running in this section. */
function SectionWhen({ section, active }: { section: Section; active: boolean }) {
  const t = drawerMessages();
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">
        {rangeLabel(section)}
      </span>
      <span className="whitespace-nowrap">{durationLabel(section.end - section.start)}</span>
      {active && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-primary">
          <span className="size-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
          {t.active}
        </span>
      )}
    </p>
  );
}

/** Whether any key figure is non-zero, so the second line is worth showing. */
function hasKeyFigures(section: Section): boolean {
  const a = section.activity;
  return Boolean(a.claudeMs || section.usage || a.commits + a.prs > 0 || troubleCount(a) > 0);
}

/** Claude's time, tokens, cost, outcomes and snags, each only when non-zero. */
function KeyFigures({ usage: u, activity: a }: { usage: Usage | null; activity: Activity }) {
  const t = drawerMessages();
  const trouble = troubleCount(a);
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {a.claudeMs ? (
        <Hint text={t.claudeTimeNote} className="whitespace-nowrap">
          {t.claudeShort(durationLabel(a.claudeMs))}
        </Hint>
      ) : null}
      {u && <span className="whitespace-nowrap">{t.tokens(tokensLabel(u.tokens))}</span>}
      {u && (
        <Hint text={u.unpriced ? t.costNoteUnpriced : t.costNote} className="whitespace-nowrap">
          {u.unpriced ? "~" : ""}
          {costLabel(u.costUsd)}
        </Hint>
      )}
      {a.commits + a.prs > 0 && <OutcomeTally commits={a.commits} prs={a.prs} />}
      {trouble > 0 && (
        <Hint text={troubleDetail(a)} className="whitespace-nowrap text-foreground/80">
          {t.troubleCount(trouble)}
        </Hint>
      )}
    </p>
  );
}
