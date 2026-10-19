// How a subagent is named, the same on Today's cards and in the drawer.

/** The fields a subagent is named by, which live and stored subagents both carry. */
export interface NamedAgent {
  name: string | null;
  agentType: string | null;
}

/**
 * What a subagent is called: its own name when it has one (a skill run in a subagent, whose type
 * is only `general-purpose`), else its type; null until its meta file is read.
 */
export function agentName(agent: NamedAgent): string | null {
  return agent.name ?? agent.agentType;
}
