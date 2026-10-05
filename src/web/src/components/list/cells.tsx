// The number cells of the table. Each renders the same way in a block row and in a total row.
import type { Activity, Usage } from "@shared/api.ts";
import { GitCommitHorizontal, GitPullRequest } from "lucide-react";
import { formatMessages } from "@/i18n/messages/format.ts";
import { listMessages } from "@/i18n/messages/list.tsx";
import {
  cacheRate,
  costLabel,
  modelLabel,
  numberLabel,
  tokensLabel,
  troubleCount,
  troubleDetail,
} from "@/lib/format.ts";
import { Hint } from "../Hint.tsx";

/** Placeholder for a number that wasn't recorded. */
export const dash = <span className="text-muted-foreground/60">—</span>;

/** Tokens in total, with the breakdown by kind on hover. */
export function TokensCell({ usage: u }: { usage: Usage | null }) {
  if (!u) return dash;
  const detail = listMessages().tokensDetail(
    numberLabel(u.input),
    numberLabel(u.output),
    numberLabel(u.cacheRead),
    numberLabel(u.cacheWrite),
  );
  return <Hint text={detail}>{tokensLabel(u.tokens)}</Hint>;
}

/** Estimated cost, marked "~" when some models had no known price. */
export function CostCell({ usage: u }: { usage: Usage | null }) {
  if (!u) return dash;
  const m = listMessages();
  return (
    <Hint text={u.unpriced ? m.costNoteUnpriced : m.costNote}>
      {u.unpriced ? "~" : ""}
      {costLabel(u.costUsd)}
    </Hint>
  );
}

/** Share of input read from the cache. */
export function CacheCell({ usage: u }: { usage: Usage | null }) {
  const rate = u ? cacheRate(u) : null;
  return rate === null ? dash : `${Math.round(rate * 100)}%`;
}

/** Commits and PRs as icons with counts; empty when there were none. */
export function OutcomesCell({ activity: a }: { activity: Activity | null }) {
  if (!a || (a.commits === 0 && a.prs === 0)) return null;
  return (
    <Hint
      className="inline-flex items-center justify-end gap-2"
      text={formatMessages().commitsPrs(a.commits, a.prs)}
    >
      {a.commits > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <GitCommitHorizontal className="size-3.5 text-muted-foreground" />
          {a.commits}
        </span>
      )}
      {a.prs > 0 && (
        <span className="inline-flex items-center gap-0.5 text-primary">
          <GitPullRequest className="size-3.5" />
          {a.prs}
        </span>
      )}
    </Hint>
  );
}

/** Files edited, with tool calls and subagents on hover. */
export function FilesCell({ activity: a }: { activity: Activity | null }) {
  if (!a || a.filesEdited === 0) return null;
  return <Hint text={listMessages().filesDetail(a.toolCalls, a.subagents)}>{a.filesEdited}</Hint>;
}

/** Count of errors and interruptions, with the breakdown on hover. */
export function TroubleCell({ activity: a }: { activity: Activity | null }) {
  const n = a ? troubleCount(a) : 0;
  if (!a || n === 0) return null;
  return (
    <Hint className="text-warn" text={troubleDetail(a)}>
      {n}
    </Hint>
  );
}

/** The main model, with the reasoning effort below it when recorded. */
export function ModelCell({ usage, activity }: { usage: Usage | null; activity: Activity | null }) {
  if (!usage?.model) return null;
  return (
    <span className="block text-muted-foreground">
      {modelLabel(usage.model)}
      {activity?.effort && <span className="block text-[11px]">{activity.effort}</span>}
    </span>
  );
}
