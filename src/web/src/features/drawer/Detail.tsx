import type { Section, SessionDetail } from "@shared/api.ts";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { type Jump, useConversationJump } from "@/hooks/useConversationJump.ts";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import { AgentTabs } from "./AgentTabs.tsx";
import { Block, CollapsedBlock } from "./Block.tsx";
import { Conversation } from "./Conversation.tsx";
import { Flow, hasFlow } from "./Flow.tsx";
import { Numbers } from "./Numbers.tsx";
import { Outcomes } from "./Outcomes.tsx";
import { SectionSummary } from "./SectionSummary.tsx";

/** The drawer body: summary → session flow → outcomes → conversation → numbers. */
export function Detail({
  session: s,
  section,
  onSelect,
  onThread,
  showConversation,
  onShowConversation,
  showNumbers,
  onShowNumbers,
}: {
  session: SessionDetail;
  section: Section | null;
  onSelect: (id: string, at: number | null) => void;
  /** Opens the session's thread. */
  onThread: (id: string) => void;
  showConversation: boolean;
  onShowConversation: (show: boolean) => void;
  showNumbers: boolean;
  onShowNumbers: (show: boolean) => void;
}) {
  // Lives here rather than in the conversation block so the choice survives collapsing it
  const [agent, setAgent] = useState<string | null>(null);
  const multiSection = section !== null && s.sections.length > 1;
  const { jump, openConversation } = useConversationJump(
    multiSection ? section : null,
    onShowConversation,
  );

  // An open conversation keeps loading downward, so numbers placed after it would be unreachable.
  // While it is open, put them before the conversation
  const numbers = (
    <Numbers session={s} section={section} open={showNumbers} onOpen={onShowNumbers} />
  );

  return (
    <div className="space-y-8">
      {section && <SectionSummary session={s} section={section} onSelect={onSelect} />}

      {hasFlow(s) && <Flow session={s} section={section} onSelect={onSelect} onThread={onThread} />}

      {(s.commits.length > 0 || s.prs.length > 0) && section && (
        <Outcomes session={s} section={section} />
      )}

      {showConversation && numbers}

      {showConversation ? (
        <ConversationBlock
          session={s}
          section={section}
          agent={agent}
          onAgent={setAgent}
          jump={jump}
          canJump={multiSection}
          onJump={openConversation}
          onCollapse={() => onShowConversation(false)}
        />
      ) : (
        <ShowConversationButton
          session={s}
          multiSection={multiSection}
          onClick={openConversation}
        />
      )}

      {!showConversation && numbers}
    </div>
  );
}

/** The open conversation, with the agent switcher and controls to jump back or collapse. */
function ConversationBlock({
  session: s,
  section,
  agent,
  onAgent,
  jump,
  canJump,
  onJump,
  onCollapse,
}: {
  session: SessionDetail;
  section: Section | null;
  agent: string | null;
  onAgent: (agent: string | null) => void;
  jump: Jump | null;
  canJump: boolean;
  onJump: () => void;
  onCollapse: () => void;
}) {
  const t = drawerMessages();
  return (
    <Block
      title={t.conversation}
      action={
        <div className="flex items-center gap-1">
          {canJump && agent === null && (
            <Button variant="outline" size="xs" onClick={onJump}>
              {t.jumpToSection}
            </Button>
          )}
          <Button variant="ghost" size="xs" onClick={onCollapse}>
            {t.collapse}
          </Button>
        </div>
      }
    >
      <AgentTabs session={s} section={section} agent={agent} onChange={onAgent} />
      <Conversation sessionId={s.id} agent={agent} jump={agent === null ? jump : null} />
    </Block>
  );
}

/** The collapsed conversation, with how many subagents ran. */
function ShowConversationButton({
  session: s,
  multiSection,
  onClick,
}: {
  session: SessionDetail;
  multiSection: boolean;
  onClick: () => void;
}) {
  const t = drawerMessages();
  return (
    <CollapsedBlock onClick={onClick}>
      {multiSection ? t.showSectionConversation : t.showConversation}
      {s.subagents.length > 0 && (
        <span className="ml-auto text-label">{t.subagentCount(s.subagents.length)}</span>
      )}
    </CollapsedBlock>
  );
}
