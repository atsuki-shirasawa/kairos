import type { Activity, Section, SessionDetail, Usage } from "@shared/api.ts";
import { Button } from "@/components/ui/button.tsx";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import { durationLabel } from "@/lib/dates.ts";
import { approxCostLabel } from "@/lib/drawer.ts";
import {
  cacheRate,
  costLabel,
  modelLabel,
  tokensLabel,
  troubleCount,
  troubleDetail,
} from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import { Hint } from "../Hint.tsx";
import { Block, CollapsedBlock } from "./Block.tsx";

/**
 * Usage and activity. Shown open by default, below what was done, so the numbers are at hand
 * without pushing the summary down. Collapsed, the key figures stay on one line.
 */
export function Numbers({
  session: s,
  section,
  open,
  onOpen,
}: {
  session: SessionDetail;
  section: Section | null;
  open: boolean;
  onOpen: (open: boolean) => void;
}) {
  const t = drawerMessages();
  const u = section ? section.usage : s.usage;
  if (!u && !section) return null;
  if (!open) return <CollapsedNumbers usage={u} section={section} onOpen={() => onOpen(true)} />;
  return (
    <div className="space-y-8">
      <UsageBlock
        session={s}
        section={section}
        action={
          <Button variant="ghost" size="xs" onClick={() => onOpen(false)} aria-expanded>
            {t.collapse}
          </Button>
        }
      />
      {section && <ActivityBlock section={section} />}
    </div>
  );
}

/** The collapsed "Numbers" row: tokens, cost and snags on one line. */
function CollapsedNumbers({
  usage: u,
  section,
  onOpen,
}: {
  usage: Usage | null;
  section: Section | null;
  onOpen: () => void;
}) {
  const t = drawerMessages();
  const trouble = section ? troubleCount(section.activity) : 0;
  return (
    <CollapsedBlock onClick={onOpen} expanded={false}>
      {t.numbers}
      <span className="ml-auto truncate font-num text-xs">
        {[
          u && t.tokens(tokensLabel(u.tokens)),
          u && approxCostLabel(u),
          trouble > 0 && t.troubleCount(trouble),
        ]
          .filter(Boolean)
          .join(t.sep)}
      </span>
    </CollapsedBlock>
  );
}

/** Token usage and breakdown for the selected period. With several periods, the session total is added too. */
function UsageBlock({
  session: s,
  section,
  action,
}: {
  session: SessionDetail;
  section: Section | null;
  action?: React.ReactNode;
}) {
  const t = drawerMessages();
  const u = section ? section.usage : s.usage;
  const showTotal = s.usage && section && (s.sections.length > 1 || u?.tokens !== s.usage.tokens);
  return (
    <Block title={section ? t.sectionUsage : t.usage} action={action}>
      {u ? (
        <UsageFigures usage={u} prompts={section?.promptCount ?? s.promptCount} />
      ) : (
        <p className="text-muted-foreground text-sm">{t.noUsage}</p>
      )}
      {showTotal && s.usage && <SessionTotal session={s} usage={s.usage} />}
    </Block>
  );
}

/** The four headline stats, then the token breakdown and model in small print. */
function UsageFigures({ usage: u, prompts }: { usage: Usage; prompts: number }) {
  const t = drawerMessages();
  const rate = cacheRate(u);
  return (
    <>
      <dl className="grid grid-cols-4 gap-x-4 gap-y-2.5">
        <Stat label={t.statTokens} value={tokensLabel(u.tokens)} />
        <Stat
          label={t.statCost}
          value={approxCostLabel(u)}
          title={u.unpriced ? t.costNoteUnpriced : t.costNote}
        />
        <Stat
          label={t.statCache}
          value={rate === null ? "—" : `${Math.round(rate * 100)}%`}
          title={t.statCacheNote}
        />
        <Stat label={t.statPrompts} value={String(prompts)} />
      </dl>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 font-num text-muted-foreground text-xs">
        <span>{t.input(tokensLabel(u.input))}</span>
        <span>{t.output(tokensLabel(u.output))}</span>
        <span>{t.cacheRead(tokensLabel(u.cacheRead))}</span>
        <span>{t.cacheWrite(tokensLabel(u.cacheWrite))}</span>
        {u.model && <span>{modelLabel(u.model)}</span>}
      </p>
    </>
  );
}

/** The whole session's tokens and cost, below a period's own figures. */
function SessionTotal({ session: s, usage }: { session: SessionDetail; usage: Usage }) {
  const t = drawerMessages();
  return (
    <p className="mt-3 border-t pt-2 text-muted-foreground text-xs">
      {t.sessionTotal(s.sections.length, s.scheduledRuns)}
      <span className="font-medium font-num text-foreground">{tokensLabel(usage.tokens)}</span>
      {t.sessionTotalTokens}
      <Hint className="font-medium font-num text-foreground" text={t.costNote}>
        {usage.unpriced ? "~" : ""}
        {costLabel(usage.costUsd)}
      </Hint>
    </p>
  );
}

/** What happened in the selected period. Zero counts are listed too, so it is clear nothing happened. */
function ActivityBlock({ section }: { section: Section }) {
  const t = drawerMessages();
  const a = section.activity;
  const items: [string, React.ReactNode, string?][] = [
    [
      t.claudeTime,
      <ClaudeTime key="c" claudeMs={a.claudeMs} span={section.end - section.start} />,
      t.claudeTimeNote,
    ],
    [t.commitsPrs, t.commitsPrsValue(a.commits, a.prs)],
    [t.filesEdited, a.filesEdited],
    [t.toolCalls, a.toolCalls, t.toolCallsNote],
    [t.subagents, a.subagents],
    [t.trouble, <Trouble key="t" activity={a} />, t.troubleNote],
    [t.compactions, a.compactions, t.compactionsNote],
    ["effort", a.effort ?? "—", t.effortNote],
  ];
  return (
    <Block title={t.sectionActivity}>
      <dl className="grid grid-cols-3 gap-x-4 gap-y-2.5 text-sm">
        {items.map(([label, value, title]) => (
          <div key={label} className="min-w-0">
            <dt className="truncate text-[11px] text-muted-foreground">
              <Hint text={title} focusable>
                {label}
              </Hint>
            </dt>
            <dd className="font-medium font-num tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Block>
  );
}

/** Claude's working time, with its share of the period beside it. */
function ClaudeTime({ claudeMs, span }: { claudeMs: number | null; span: number }) {
  if (claudeMs === null) return "—";
  return (
    <>
      {durationLabel(claudeMs)}
      {span > 0 && (
        <span className="ml-1 font-normal text-muted-foreground text-xs">
          {Math.min(100, Math.round((claudeMs / span) * 100))}%
        </span>
      )}
    </>
  );
}

/** The snag count, highlighted when non-zero, with what kind of snags they were below it. */
function Trouble({ activity: a }: { activity: Activity }) {
  const trouble = troubleCount(a);
  return (
    <span className={cn(trouble > 0 && "text-warn")}>
      {trouble}
      {trouble > 0 && (
        <span className="block font-normal text-muted-foreground text-xs">{troubleDetail(a)}</span>
      )}
    </span>
  );
}

/** Label over value, the same as the activity grid, so the drawer has one way of showing a number. */
function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-muted-foreground">
        <Hint text={title} focusable>
          {label}
        </Hint>
      </dt>
      <dd className="font-medium font-num text-sm tabular-nums">{value}</dd>
    </div>
  );
}
