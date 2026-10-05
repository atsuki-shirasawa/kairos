import type { Section, SessionDetail, Subagent } from "@shared/api.ts";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import { hhmm } from "@/lib/dates.ts";
import { splitSubagents } from "@/lib/drawer.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Switches the conversation: "Main" plus a single select for subagents, on one line.
 * There can be dozens of subagents, and tabs would push the conversation down.
 */
export function AgentTabs({
  session: s,
  section,
  agent,
  onChange,
}: {
  session: SessionDetail;
  section: Section | null;
  agent: string | null;
  onChange: (agent: string | null) => void;
}) {
  const t = drawerMessages();
  if (s.subagents.length === 0) return null;
  const selected = s.subagents.find((a) => a.id === agent) ?? null;

  return (
    <div className="mb-3 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Tab active={agent === null} onClick={() => onChange(null)}>
          {t.main}
        </Tab>
        <SubagentSelect
          subagents={s.subagents}
          section={section}
          agent={agent}
          highlighted={selected !== null}
          onChange={onChange}
        />
      </div>
      {selected?.description && (
        <p className="text-muted-foreground text-xs">
          {t.subagentTask(selected.agentType ?? t.subagent, selected.description)}
        </p>
      )}
    </div>
  );
}

/** The subagent picker. Those that ran in the selected period are listed first. */
function SubagentSelect({
  subagents,
  section,
  agent,
  highlighted,
  onChange,
}: {
  subagents: Subagent[];
  section: Section | null;
  agent: string | null;
  highlighted: boolean;
  onChange: (agent: string | null) => void;
}) {
  const t = drawerMessages();
  const { here, others } = splitSubagents(subagents, section);
  return (
    <select
      aria-label={t.ariaSubagent}
      className={cn(
        "min-w-0 flex-1 truncate rounded-full border bg-transparent px-2.5 py-0.5 text-xs",
        highlighted ? "border-primary text-foreground" : "text-muted-foreground",
      )}
      value={agent ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{t.subagentOption(subagents.length)}</option>
      {here.length > 0 && <optgroup label={t.thisPeriod}>{here.map(subagentOption)}</optgroup>}
      {others.length > 0 && (
        <optgroup label={here.length > 0 ? t.otherPeriods : t.thisSession}>
          {others.map(subagentOption)}
        </optgroup>
      )}
    </select>
  );
}

/** "9:05 Explore: find the parser" — start time, type and task, as far as they are known. */
function subagentOption(a: Subagent) {
  return (
    <option key={a.id} value={a.id}>
      {a.startedAt ? `${hhmm(a.startedAt)} ` : ""}
      {a.agentType ?? drawerMessages().subagent}
      {a.description ? `: ${a.description}` : ""}
    </option>
  );
}

/** A pill-shaped toggle button. */
function Tab({ active, children, ...props }: { active: boolean } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-0.5 text-xs",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
      )}
      {...props}
    >
      {children}
    </button>
  );
}
