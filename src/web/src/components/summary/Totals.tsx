import { formatMessages } from "@/i18n/messages/format.ts";
import { listMessages } from "@/i18n/messages/list.tsx";
import { summaryMessages } from "@/i18n/messages/summary.ts";
import type { View } from "@/lib/dates.ts";
import { durationLabel } from "@/lib/dates.ts";
import { costLabel, numberLabel, tokensLabel } from "@/lib/format.ts";
import { type Comparable, comparable, signed } from "@/lib/periodChange.ts";
import type { PeriodSummary } from "@/lib/summary.ts";
import { cn } from "@/lib/utils.ts";
import { Hint } from "../Hint.tsx";
import { MomentNode } from "../MomentNode.tsx";
import { costText } from "./shared.tsx";

/**
 * How much weight a figure gets: the time worked leads, what came of it (commits and PRs) follows,
 * and what it cost (tokens, money) is set quietest, as context rather than achievement.
 */
type Tier = "lead" | "outcome" | "spend";

/** One figure of the totals row. */
interface Figure {
  label: string;
  tier: Tier;
  /** Commits and PRs carry the node the calendar marks them with. */
  node?: "commit" | "pr";
  value: string;
  /** Under the value: the change from the period before, and any detail. */
  sub: React.ReactNode;
  hint?: string;
}

/** The period's key figures, each with the change from the period before. */
export function Totals({
  view,
  soFar,
  summary: s,
  before: b,
}: {
  view: View;
  /** The period is still running, so the period before is counted up to the same point. */
  soFar: boolean;
  summary: PeriodSummary;
  before: PeriodSummary | null;
}) {
  const m = summaryMessages();
  const l = listMessages();
  const now = comparable(s);
  const then = b ? comparable(b) : null;
  // Whether more is better depends on the number (cost), so changes stay neutral in color
  const change = (key: keyof Comparable, label: (n: number) => string) => {
    if (then === null) return null;
    const diff = now[key] - then[key];
    return diff === 0 ? m.unchanged(view, soFar) : m.versus(view, signed(diff, label), soFar);
  };
  const figures: Figure[] = [
    {
      label: m.working,
      tier: "lead",
      value: durationLabel(s.busyMs),
      sub: (
        <>
          {s.claudeMs ? (
            <Hint text={m.claudeNote}>
              <span>{m.claude(durationLabel(s.claudeMs))}</span>
            </Hint>
          ) : null}
          <span>{change("busyMs", durationLabel)}</span>
        </>
      ),
    },
    {
      label: m.commits,
      tier: "outcome",
      node: "commit",
      value: numberLabel(s.commits),
      sub: change("commits", numberLabel),
    },
    {
      label: m.prs,
      tier: "outcome",
      node: "pr",
      value: numberLabel(s.prs.length),
      sub: change("prs", numberLabel),
    },
    {
      label: m.tokens,
      tier: "spend",
      value: s.usage ? tokensLabel(s.usage.tokens) : formatMessages().none,
      sub: change("tokens", tokensLabel),
    },
    {
      label: m.cost,
      tier: "spend",
      value: costText(s.usage),
      hint: s.usage?.unpriced ? l.costNoteUnpriced : l.costNote,
      sub: change("cents", (n) => costLabel(n / 100)),
    },
  ];
  return (
    // Each figure spans three rows of the shared grid (subgrid), so labels, values and the lines
    // under them align across figures even though the lead value is set larger
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-y-0.5">
      {figures.map((f) => (
        <FigureItem key={f.label} figure={f} />
      ))}
    </dl>
  );
}

/** Value type by tier: lead largest, outcomes in ink, spend smaller and muted. */
const VALUE_CLASS: Record<Tier, string> = {
  lead: "text-[1.75rem] leading-9 text-foreground",
  outcome: "text-xl leading-7 text-foreground",
  spend: "text-base leading-7 text-muted-foreground",
};

/** A figure as label, value and the line under it, weighted by its tier. */
function FigureItem({ figure: f }: { figure: Figure }) {
  return (
    <div className="row-span-3 mb-3 grid min-w-0 grid-rows-subgrid items-end border-l pr-2 pl-4">
      <dt className="flex items-center gap-1.5 text-muted-foreground text-xs">
        {f.node && <MomentNode pr={f.node === "pr"} />}
        {f.hint ? <Hint text={f.hint}>{f.label}</Hint> : f.label}
      </dt>
      <dd className={cn("font-num font-semibold tabular-nums", VALUE_CLASS[f.tier])}>{f.value}</dd>
      <dd className="flex min-h-4 flex-col self-start font-num text-[11px] text-muted-foreground leading-4">
        {f.sub}
      </dd>
    </div>
  );
}
