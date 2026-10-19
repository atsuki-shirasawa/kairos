import type { LiveAgent, LiveSession, LiveTool } from "@shared/api.ts";
import { liveMessages } from "@/i18n/messages/live.ts";
import { agentRow, delegateAgent, toolLabel } from "@/lib/live.ts";

/**
 * The call a card shows as what the session does: its delegate's while the turn waits on one
 * subagent (the session's own only says a subagent runs), else the session's own call in flight.
 */
export function CallLine({ session, now }: { session: LiveSession; now: number }) {
  const delegate = delegateAgent(session);
  if (delegate) return <DelegateCall agent={delegate} fallback={session.tool} now={now} />;
  return session.tool ? <ToolLine tool={session.tool} /> : null;
}

/** A call in flight: the tool's name, then its one-line summary (a command, a path). */
function ToolLine({ tool }: { tool: LiveTool }) {
  return (
    <p className="line-clamp-2 break-all">
      <span className="font-medium">{toolLabel(tool.name)}</span>{" "}
      <span className="text-muted-foreground">{tool.text}</span>
    </p>
  );
}

/**
 * The delegate's call, then who runs it, what it was asked and for how long. While it thinks
 * between calls, the session's own call stays, so the line doesn't blink on every refresh.
 */
function DelegateCall({
  agent,
  fallback,
  now,
}: {
  agent: LiveAgent;
  fallback: LiveTool | null;
  now: number;
}) {
  const m = liveMessages();
  const tool = agent.tool ?? fallback;
  return (
    <div className="min-w-0">
      {tool && <ToolLine tool={tool} />}
      <p className="flex min-w-0 gap-1.5 text-muted-foreground">
        {/* "by Subagent" says nothing until the meta file names its type */}
        {agent.agentType && <span className="shrink-0">{m.delegatedTo(agent.agentType)}</span>}
        {agent.description && <span className="truncate">{agent.description}</span>}
        <span className="ml-auto shrink-0 font-num">{agentRow(agent, now).status}</span>
      </p>
    </div>
  );
}
