import type { LiveSession } from "@shared/api.ts";
import { liveMessages } from "@/i18n/messages/live.ts";
import { agentRows, type LiveAgentRow, runningAgents, toolLabel } from "@/lib/live.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The card's subagents, nested under what the session itself does: running ones first, each with
 * what it was asked and the call it is in, then those that finished a moment ago, dimmed. Past
 * `AGENT_ROWS` the rest fold into a count, so a fan-out of dozens doesn't swamp the column.
 */
export function CardAgents({ session, now }: { session: LiveSession; now: number }) {
  const m = liveMessages();
  const { rows, more } = agentRows(session.agents, now);
  if (rows.length === 0) return null;
  return (
    <ul aria-label={m.subagents} className="flex flex-col gap-1 pl-3 text-label">
      {rows.map((row) => (
        <AgentRow key={row.agent.id} row={row} />
      ))}
      {more > 0 && <li className="text-muted-foreground">{m.agentsMore(more)}</li>}
    </ul>
  );
}

/**
 * An idle row's count of subagents still running: background ones go on while the session waits,
 * and the row has no room to list them.
 */
export function AgentCount({ session }: { session: LiveSession }) {
  const m = liveMessages();
  const running = runningAgents(session.agents);
  if (running === 0) return null;
  return <span className="shrink-0 font-num">{m.agentsRunning(running)}</span>;
}

/** One subagent: its type and task on a line with how long it runs, then the call it is in. */
function AgentRow({ row }: { row: LiveAgentRow }) {
  const { agent: a } = row;
  return (
    <li className="min-w-0">
      <div className="flex min-w-0 items-baseline gap-1.5">
        <AgentDot running={a.running} />
        <span className={cn("shrink-0 font-medium", !a.running && "text-muted-foreground")}>
          {row.name}
        </span>
        {a.description && <span className="truncate text-muted-foreground">{a.description}</span>}
        <span className="ml-auto shrink-0 font-num text-muted-foreground">{row.status}</span>
      </div>
      {a.tool && (
        <p className="truncate pl-3 text-muted-foreground">
          <span className="text-foreground">{toolLabel(a.tool.name)}</span> {a.tool.text}
        </p>
      )}
    </li>
  );
}

/** A running subagent pulses in the project color like the card's own dot; a done one is a ring. */
function AgentDot({ running }: { running: boolean }) {
  const base = "size-1.5 shrink-0 rounded-full";
  if (running)
    return <span className={cn(base, "animate-pulse bg-[var(--c)] motion-reduce:animate-none")} />;
  return <span className={cn(base, "border border-muted-foreground")} />;
}
