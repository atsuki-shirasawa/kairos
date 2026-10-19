import type { LiveAgent, LiveSession, LiveTool } from "@shared/api.ts";
import { agentRow, delegateAgent } from "@/lib/live.ts";
import { DelegatedTo, ToolText } from "./CallText.tsx";

/**
 * The calls a card shows as what the session does. A foreground delegate's call replaces the
 * session's own, which only says a subagent runs; a background delegate works beside the session,
 * so the session's own call, if any, comes first and the delegate's under it.
 */
export function CallLine({ session, now }: { session: LiveSession; now: number }) {
  const delegate = delegateAgent(session);
  const own = session.tool ? <ToolLine tool={session.tool} /> : null;
  if (!delegate) return own;
  if (!delegate.background)
    return <DelegateCall agent={delegate} fallback={session.tool} now={now} />;
  return (
    <>
      {own}
      <DelegateCall agent={delegate} fallback={null} now={now} />
    </>
  );
}

/** A call in flight, on up to two lines. */
function ToolLine({ tool }: { tool: LiveTool }) {
  return (
    <p className="line-clamp-2 break-all">
      <ToolText tool={tool} />
    </p>
  );
}

/**
 * The delegate's call, then who runs it, what it was asked and for how long. While it thinks
 * between calls, the session's own call stands in (it waits on this subagent), else what the
 * subagent was asked, so the line keeps its place instead of blinking on every refresh.
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
  const tool = agent.tool ?? fallback;
  return (
    <div className="min-w-0">
      {tool ? (
        <ToolLine tool={tool} />
      ) : (
        agent.description && <p className="truncate text-muted-foreground">{agent.description}</p>
      )}
      <p className="flex min-w-0 gap-1.5 text-muted-foreground">
        <DelegatedTo agent={agent} />
        {tool && agent.description && <span className="truncate">{agent.description}</span>}
        <span className="ml-auto shrink-0 font-num">{agentRow(agent, now).status}</span>
      </p>
    </div>
  );
}
