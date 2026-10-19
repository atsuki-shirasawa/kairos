import type { LiveTool } from "@shared/api.ts";
import { liveMessages } from "@/i18n/messages/live.ts";
import { agentName, type NamedAgent } from "@/lib/agents.ts";
import { toolLabel } from "@/lib/live.ts";

/** A call's text: the tool's name in medium, then its one-line summary (a command, a path). */
export function ToolText({ tool }: { tool: LiveTool }) {
  return (
    <>
      <span className="font-medium">{toolLabel(tool.name)}</span>{" "}
      <span className="text-muted-foreground">{tool.text}</span>
    </>
  );
}

/** Who runs a delegate's call ("by code-review"), shared by the card's call line and a row's. */
export function DelegatedTo({ agent }: { agent: NamedAgent }) {
  const m = liveMessages();
  const name = agentName(agent);
  // "by Subagent" says nothing until the meta file names it
  if (!name) return null;
  return <span className="shrink-0 text-muted-foreground">{m.delegatedTo(name)}</span>;
}
