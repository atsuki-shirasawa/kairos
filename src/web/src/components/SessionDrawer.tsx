import type { Artifact, Project, Section, SessionDetail, Subagent, Usage } from "@shared/api.ts";
import { ARTIFACT_GRACE_MS } from "@shared/constants.ts";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  RefreshCw,
  Sparkles,
  SquareTerminal,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { useRequestSummary, useSession } from "@/hooks/queries.ts";
import { useCopy } from "@/hooks/useCopy.ts";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel, durationLabel, hhmm, isSameDay, relativeDay } from "@/lib/dates.ts";
import {
  cacheRate,
  costLabel,
  modelLabel,
  tokensLabel,
  troubleCount,
  troubleDetail,
} from "@/lib/format.ts";
import { issueBaseUrl } from "@/lib/issueLinks.ts";
import { resumeCommand } from "@/lib/shell.ts";
import { cn } from "@/lib/utils.ts";
import { Conversation } from "./Conversation.tsx";
import { Hint } from "./Hint.tsx";
import { Markdown } from "./Markdown.tsx";

interface Props {
  id: string;
  /** Start of the selected section. null means the last section. */
  at: number | null;
  onClose: () => void;
  onSelect: (id: string, at: number | null) => void;
  /** Move to the previous / next work in time order. null at either end. */
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}

/** The detail pane on the right. The heading stays pinned; below it: summary → session flow → outcomes → conversation → numbers. */
export function SessionDrawer({ id, at, onClose, onSelect, onPrev, onNext }: Props) {
  const t = drawerMessages();
  const { data, isPending, isError, error } = useSession(id);
  // The conversation is long, so it starts collapsed; the numbers start open. Either choice holds
  // until the drawer closes (so moving with j / k keeps the same view for comparison)
  const [showConversation, setShowConversation] = useState(false);
  const [showNumbers, setShowNumbers] = useState(true);
  const section = data
    ? (data.sections.find((x) => x.start === at) ?? data.sections.at(-1) ?? null)
    : null;

  // On narrow screens the drawer overlays the calendar, so move focus into it on open
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (matchMedia("(width < 64rem)").matches) asideRef.current?.focus();
  }, []);

  // When moving to other work, start from the top (the summary) so the previous scroll position
  // does not carry over while reading with j / k. With the conversation open, leave it alone:
  // the conversation scrolls itself to the selected time
  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationOpen = useRef(showConversation);
  conversationOpen.current = showConversation;
  // biome-ignore lint/correctness/useExhaustiveDependencies: run only when the selected work changes
  useEffect(() => {
    if (!conversationOpen.current) scrollRef.current?.scrollTo({ top: 0 });
  }, [id, at]);

  return (
    <>
      {/* Only when overlaid on narrow screens: dim the backdrop and close on outside click */}
      <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={onClose} aria-hidden />
      <aside
        ref={asideRef}
        tabIndex={-1}
        className={cn(
          "flex w-full shrink-0 flex-col border-l bg-card outline-none",
          "max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:max-w-md max-lg:shadow-2xl",
          "lg:w-[26rem] xl:w-[30rem]",
        )}
        aria-label={t.ariaDetail}
      >
        {/* The heading does not scroll, so it stays clear which work this is even deep in the conversation */}
        <header className="shrink-0 border-b px-4 pt-2 pb-4">
          {/* The first line holds where the work happened (project, worktree, branch) and the controls, leaving width for the heading */}
          <div className="flex h-9 items-center gap-2">
            <div className="min-w-0 flex-1">
              {data && (
                <ProjectLine project={data.project} label={data.label} branch={data.branch} />
              )}
            </div>
            <div className="-mr-1.5 flex shrink-0 items-center">
              {data && <ResumeButton session={data} />}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onPrev ?? undefined}
                disabled={!onPrev}
                aria-label={t.prev}
                title={t.prev}
              >
                <ChevronUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onNext ?? undefined}
                disabled={!onNext}
                aria-label={t.next}
                title={t.next}
              >
                <ChevronDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                aria-label={t.close}
                title={t.close}
              >
                <X />
              </Button>
            </div>
          </div>
          {data && <DetailHeader session={data} section={section} />}
        </header>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-10"
          data-drawer-scroll
        >
          {isPending && <p className="text-muted-foreground text-sm">{t.loading}</p>}
          {isError && <p className="text-destructive text-sm">{t.loadFailed(error.message)}</p>}
          {data && (
            <Detail
              key={data.id}
              session={data}
              section={section}
              onSelect={onSelect}
              showConversation={showConversation}
              onShowConversation={setShowConversation}
              showNumbers={showNumbers}
              onShowNumbers={setShowNumbers}
            />
          )}
        </div>
      </aside>
    </>
  );
}

/**
 * Copies `cd <dir> && claude --resume <id>`. Looking back usually ends in picking the work up again,
 * and Kairos never runs anything itself, so the command goes to the user's own terminal.
 */
function ResumeButton({ session: s }: { session: SessionDetail }) {
  const t = drawerMessages();
  const [state, copy] = useCopy();
  const label =
    state === "copied"
      ? t.copiedResume
      : state === "failed"
        ? formatMessages().copyFailed
        : t.copyResume;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => copy(resumeCommand(s.id, s.launchCwd))}
      aria-label={label}
      title={label}
    >
      {state === "copied" ? <Check className="text-primary" /> : <SquareTerminal />}
      {/* Announce the result; the icon change alone is silent */}
      <span className="sr-only" aria-live="polite">
        {state === "idle" ? "" : label}
      </span>
    </Button>
  );
}

function DetailHeader({
  session: s,
  section,
}: {
  session: SessionDetail;
  section: Section | null;
}) {
  const headline = section?.headline ?? s.title;
  return (
    // The colored line on the left ties this detail to its block on the calendar
    <div className="mt-1 border-l-[3px] pl-3" style={{ borderColor: projectColor(s.project) }}>
      <h2
        className="line-clamp-2 text-balance font-semibold text-[17px] leading-snug tracking-tight"
        title={headline}
      >
        {headline}
      </h2>
      {section && section.headline !== s.title && (
        <p className="mt-0.5 line-clamp-1 text-muted-foreground text-xs" title={s.title}>
          {s.title}
        </p>
      )}
      {section && <SectionTime session={s} section={section} />}
    </div>
  );
}

function Detail({
  session: s,
  section,
  onSelect,
  showConversation,
  onShowConversation,
  showNumbers,
  onShowNumbers,
}: {
  session: SessionDetail;
  section: Section | null;
  onSelect: Props["onSelect"];
  showConversation: boolean;
  onShowConversation: (show: boolean) => void;
  showNumbers: boolean;
  onShowNumbers: (show: boolean) => void;
}) {
  const t = drawerMessages();
  const [agent, setAgent] = useState<string | null>(null);
  const multiSection = section !== null && s.sections.length > 1;
  // Even when moving to another block while open, show the conversation from the selected time
  const [jump, setJump] = useState<{ ts: number; key: number } | null>(
    multiSection && section ? { ts: section.start, key: 0 } : null,
  );
  const openConversation = () => {
    if (multiSection && section) setJump((j) => ({ ts: section.start, key: (j?.key ?? 0) + 1 }));
    onShowConversation(true);
  };

  // An open conversation keeps loading downward, so numbers placed after it would be unreachable.
  // While it is open, put them before the conversation
  const numbers = (
    <Numbers session={s} section={section} open={showNumbers} onOpen={onShowNumbers} />
  );

  return (
    <div className="space-y-8">
      {section && <SectionSummary session={s} section={section} />}

      {(s.sections.length > 1 || s.awaySummary || s.continuedFrom || s.continuedIn) && (
        <Flow session={s} section={section} onSelect={onSelect} />
      )}

      {(s.commits.length > 0 || s.prs.length > 0) && section && (
        <Outcomes session={s} section={section} />
      )}

      {showConversation && numbers}

      {showConversation ? (
        <Block
          title={t.conversation}
          action={
            <div className="flex items-center gap-1">
              {multiSection && agent === null && (
                <Button variant="outline" size="xs" onClick={openConversation}>
                  {t.jumpToSection}
                </Button>
              )}
              <Button variant="ghost" size="xs" onClick={() => onShowConversation(false)}>
                {t.collapse}
              </Button>
            </div>
          }
        >
          <AgentTabs session={s} section={section} agent={agent} onChange={setAgent} />
          <Conversation sessionId={s.id} agent={agent} jump={agent === null ? jump : null} />
        </Block>
      ) : (
        <button
          type="button"
          onClick={openConversation}
          className="flex w-full items-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-left text-muted-foreground text-sm hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="size-4 shrink-0" />
          {multiSection ? t.showSectionConversation : t.showConversation}
          {s.subagents.length > 0 && (
            <span className="ml-auto text-xs">{t.subagentCount(s.subagents.length)}</span>
          )}
        </button>
      )}

      {!showConversation && numbers}
    </div>
  );
}

/**
 * Usage and activity. Shown open by default, below what was done, so the numbers are at hand
 * without pushing the summary down. Collapsed, the key figures stay on one line.
 */
function Numbers({
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
  const trouble = section ? troubleCount(section.activity) : 0;
  if (!u && !section) return null;
  if (!open)
    return (
      <button
        type="button"
        onClick={() => onOpen(true)}
        aria-expanded={false}
        className="flex w-full items-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-left text-muted-foreground text-sm hover:bg-accent hover:text-foreground"
      >
        <ChevronRight className="size-4 shrink-0" />
        {t.numbers}
        <span className="ml-auto truncate font-num text-xs">
          {[
            u && t.tokens(tokensLabel(u.tokens)),
            u && `${u.unpriced ? "~" : ""}${costLabel(u.costUsd)}`,
            trouble > 0 && t.troubleCount(trouble),
          ]
            .filter(Boolean)
            .join(t.sep)}
        </span>
      </button>
    );
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
  const rate = u ? cacheRate(u) : null;
  const showTotal = s.usage && section && (s.sections.length > 1 || u?.tokens !== s.usage.tokens);
  return (
    <Block title={section ? t.sectionUsage : t.usage} action={action}>
      {u ? (
        <>
          <dl className="grid grid-cols-4 gap-x-4 gap-y-2.5">
            <Stat label={t.statTokens} value={tokensLabel(u.tokens)} />
            <Stat
              label={t.statCost}
              value={`${u.unpriced ? "~" : ""}${costLabel(u.costUsd)}`}
              title={u.unpriced ? t.costNoteUnpriced : t.costNote}
            />
            <Stat
              label={t.statCache}
              value={rate === null ? "—" : `${Math.round(rate * 100)}%`}
              title={t.statCacheNote}
            />
            <Stat label={t.statPrompts} value={String(section?.promptCount ?? s.promptCount)} />
          </dl>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 font-num text-muted-foreground text-xs">
            <span>{t.input(tokensLabel(u.input))}</span>
            <span>{t.output(tokensLabel(u.output))}</span>
            <span>{t.cacheRead(tokensLabel(u.cacheRead))}</span>
            <span>{t.cacheWrite(tokensLabel(u.cacheWrite))}</span>
            {u.model && <span>{modelLabel(u.model)}</span>}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t.noUsage}</p>
      )}
      {showTotal && s.usage && <SessionTotal session={s} usage={s.usage} />}
    </Block>
  );
}

/** What happened in the selected period. Zero counts are listed too, so it is clear nothing happened. */
function ActivityBlock({ section }: { section: Section }) {
  const t = drawerMessages();
  const a = section.activity;
  const span = section.end - section.start;
  const trouble = troubleCount(a);
  const items: [string, React.ReactNode, string?][] = [
    [
      t.claudeTime,
      a.claudeMs === null ? (
        "—"
      ) : (
        <>
          {durationLabel(a.claudeMs)}
          {span > 0 && (
            <span className="ml-1 font-normal text-muted-foreground text-xs">
              {Math.min(100, Math.round((a.claudeMs / span) * 100))}%
            </span>
          )}
        </>
      ),
      t.claudeTimeNote,
    ],
    [t.commitsPrs, t.commitsPrsValue(a.commits, a.prs)],
    [t.filesEdited, a.filesEdited],
    [t.toolCalls, a.toolCalls, t.toolCallsNote],
    [t.subagents, a.subagents],
    [
      t.trouble,
      <span key="t" className={cn(trouble > 0 && "text-warn")}>
        {trouble}
        {trouble > 0 && (
          <span className="block font-normal text-muted-foreground text-xs">
            {troubleDetail(a)}
          </span>
        )}
      </span>,
      t.troubleNote,
    ],
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

/** With more periods than this, show only those around the selected one and collapse the rest. */
const FLOW_LIMIT = 6;

/**
 * The session flow (headings of every period) and notes about the whole session.
 * Periods without a summary use the first prompt verbatim and run long, so they are kept to one muted line.
 */
function Flow({
  session: s,
  section,
  onSelect,
}: {
  session: SessionDetail;
  section: Section | null;
  onSelect: Props["onSelect"];
}) {
  const t = drawerMessages();
  const [expanded, setExpanded] = useState(false);
  const multiDay = s.sections.some((x) => !isSameDay(x.start, s.sections[0]?.start ?? 0));
  const current = section ? s.sections.indexOf(section) : s.sections.length - 1;
  const from = Math.max(
    0,
    Math.min(current - Math.floor(FLOW_LIMIT / 2), s.sections.length - FLOW_LIMIT),
  );
  const shown =
    expanded || s.sections.length <= FLOW_LIMIT
      ? s.sections
      : s.sections.slice(from, from + FLOW_LIMIT);
  const hiddenBefore = shown[0] ? s.sections.indexOf(shown[0]) : 0;
  const hiddenAfter = s.sections.length - hiddenBefore - shown.length;

  return (
    <Block
      title={t.flow}
      action={
        s.sections.length > FLOW_LIMIT ? (
          <Button variant="ghost" size="xs" onClick={() => setExpanded((v) => !v)}>
            {expanded ? t.showAround : t.showAll(s.sections.length)}
          </Button>
        ) : null
      }
    >
      {hiddenBefore > 0 && <Hidden count={hiddenBefore} where="before" />}
      {s.sections.length > 1 && (
        <ol className="space-y-0.5">
          {shown.map((x) => {
            const selected = x.start === section?.start;
            return (
              <li key={x.start}>
                <button
                  type="button"
                  onClick={() => onSelect(s.id, x.start)}
                  aria-current={selected}
                  title={x.headline}
                  className={cn(
                    "flex w-full items-baseline gap-3 rounded-r-md border-transparent border-l-2 px-2 py-1.5 text-left text-sm hover:bg-accent",
                    selected && "border-primary bg-accent font-medium",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 font-num text-muted-foreground text-xs",
                      multiDay ? "w-24" : "w-[4.5rem]",
                    )}
                  >
                    {/* In sessions spanning days, every period gets a date, including the first */}
                    {multiDay &&
                      `${new Date(x.start).getMonth() + 1}/${new Date(x.start).getDate()} `}
                    {hhmm(x.start)}–{hhmm(x.end)}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1",
                      x.body ? "line-clamp-2" : "line-clamp-1",
                      !x.body && !selected && "text-muted-foreground",
                    )}
                  >
                    {x.headline}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {hiddenAfter > 0 && <Hidden count={hiddenAfter} where="after" />}

      {s.awaySummary && <AwaySummary text={s.awaySummary} />}

      {(s.continuedFrom || s.continuedIn) && (
        <div className="mt-3 flex gap-4 text-sm">
          {s.continuedFrom && (
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => onSelect(s.continuedFrom ?? "", null)}
            >
              {t.prevSession}
            </button>
          )}
          {s.continuedIn && (
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => onSelect(s.continuedIn ?? "", null)}
            >
              {t.nextSession}
            </button>
          )}
        </div>
      )}
    </Block>
  );
}

/** The recap Claude Code left behind. Often long, so it is clamped to 3 lines and expandable. */
function AwaySummary({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="mt-3 block w-full border-l-2 pl-3 text-left text-muted-foreground text-xs leading-relaxed hover:text-foreground"
    >
      <span className="mb-0.5 block font-medium">{drawerMessages().awaySummary}</span>
      <span className={cn("block", !open && "line-clamp-3")}>{text}</span>
    </button>
  );
}

function Hidden({ count, where }: { count: number; where: "before" | "after" }) {
  const t = drawerMessages();
  return (
    <p className="px-2 py-0.5 text-muted-foreground text-xs">
      {where === "before" ? t.hiddenBefore(count) : t.hiddenAfter(count)}
    </p>
  );
}

/** Show this many outcomes for the period up front and collapse the rest, to keep the conversation close. */
const OUTCOME_LIMIT = 5;

/** Outcomes. Those from the selected period come first; the rest of the session is collapsed. */
function Outcomes({ session: s, section }: { session: SessionDetail; section: Section }) {
  const t = drawerMessages();
  const all = [...s.prs, ...s.commits];
  const inSection = (a: Artifact) =>
    a.ts !== null && a.ts >= section.start && a.ts <= section.end + ARTIFACT_GRACE_MS;
  const here = all.filter(inSection);
  const rest = all.filter((a) => !inSection(a));
  return (
    <Block title={t.sectionOutcomes}>
      {here.length > 0 ? (
        <>
          <ArtifactList items={here.slice(0, OUTCOME_LIMIT)} />
          {here.length > OUTCOME_LIMIT && (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-muted-foreground text-xs">
                {t.moreItems(here.length - OUTCOME_LIMIT)}
              </summary>
              <div className="mt-1.5">
                <ArtifactList items={here.slice(OUTCOME_LIMIT)} />
              </div>
            </details>
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t.noOutcomes}</p>
      )}
      {rest.length > 0 && (
        <details className="group mt-3">
          <summary className="cursor-pointer text-muted-foreground text-xs">
            {t.sessionOutcomes(rest.length)}
          </summary>
          <div className="mt-2">
            <ArtifactList items={rest} />
          </div>
        </details>
      )}
    </Block>
  );
}

function ArtifactList({ items }: { items: Artifact[] }) {
  return (
    <ul className="space-y-2 text-sm leading-snug">
      {items.map((a) =>
        a.kind === "pr" ? (
          <li key={a.ref} className="flex items-baseline gap-2">
            <GitPullRequest className="size-4 shrink-0 translate-y-0.5 text-muted-foreground" />
            <PrLink artifact={a} />
          </li>
        ) : (
          <li key={a.ref} className="flex items-baseline gap-2">
            <GitCommitHorizontal className="size-4 shrink-0 translate-y-0.5 text-muted-foreground" />
            {!a.ref.startsWith("subject:") && (
              <code className="shrink-0 text-muted-foreground text-xs">{a.ref.slice(0, 7)}</code>
            )}
            <span className="min-w-0 break-words">{a.title}</span>
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * A PR link. The number comes from the URL and sits beside the title. PRs whose title could not be
 * captured (e.g. created with `--fill`) are stored as "#number repository", so the repository name is
 * shown as a secondary label.
 */
function PrLink({ artifact: a }: { artifact: Artifact }) {
  const num = /\/pull\/(\d+)/.exec(a.ref)?.[1];
  const repo = /^#\d+\s+(.+)$/.exec(a.title ?? "")?.[1];
  return (
    <a
      href={a.ref}
      target="_blank"
      rel="noreferrer"
      className="min-w-0 break-words text-primary hover:underline"
    >
      {num && <span className="mr-1.5 font-medium font-num">#{num}</span>}
      {repo ? (
        <span className="text-muted-foreground text-xs">{repo}</span>
      ) : (
        <span>{a.title ?? a.ref}</span>
      )}
      <ExternalLink className="ml-1 inline size-3" />
    </a>
  );
}

/**
 * Switches the conversation: "Main" plus a single select for subagents, on one line.
 * There can be dozens of subagents, and tabs would push the conversation down.
 * The select lists those that ran in the selected period first.
 */
function AgentTabs({
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
  const during = (a: Subagent) =>
    section !== null &&
    a.startedAt !== null &&
    a.endedAt !== null &&
    a.startedAt <= section.end &&
    a.endedAt >= section.start;
  const here = s.subagents.filter(during);
  const others = s.subagents.filter((a) => !during(a));
  const selected = s.subagents.find((a) => a.id === agent) ?? null;
  const option = (a: Subagent) => (
    <option key={a.id} value={a.id}>
      {a.startedAt ? `${hhmm(a.startedAt)} ` : ""}
      {a.agentType ?? t.subagent}
      {a.description ? `: ${a.description}` : ""}
    </option>
  );

  return (
    <div className="mb-3 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Tab active={agent === null} onClick={() => onChange(null)}>
          {t.main}
        </Tab>
        <select
          aria-label={t.ariaSubagent}
          className={cn(
            "min-w-0 flex-1 truncate rounded-full border bg-transparent px-2.5 py-0.5 text-xs",
            selected ? "border-primary text-foreground" : "text-muted-foreground",
          )}
          value={agent ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">{t.subagentOption(s.subagents.length)}</option>
          {here.length > 0 && <optgroup label={t.thisPeriod}>{here.map(option)}</optgroup>}
          {others.length > 0 && (
            <optgroup label={here.length > 0 ? t.otherPeriods : t.thisSession}>
              {others.map(option)}
            </optgroup>
          )}
        </select>
      </div>
      {selected?.description && (
        <p className="text-muted-foreground text-xs">
          {t.subagentTask(selected.agentType ?? t.subagent, selected.description)}
        </p>
      )}
    </div>
  );
}

/** Summary of the selected section, or a button to make one. Short sections say so. */
function SectionSummary({ session: s, section }: { session: SessionDetail; section: Section }) {
  const t = drawerMessages();
  const request = useRequestSummary(s.id);
  const busy = section.pending || request.isPending;
  const button = (label: string, Icon: typeof Sparkles) => (
    <Button
      variant="outline"
      size="xs"
      onClick={() => request.mutate(section.start)}
      disabled={busy}
    >
      <Icon className={cn(busy && "animate-spin motion-reduce:animate-none")} />
      {busy ? t.summarizing : label}
    </Button>
  );

  return (
    <Block
      title={t.sectionSummary}
      emphasis
      action={section.body ? button(t.regenerate, RefreshCw) : null}
    >
      {section.body ? (
        <>
          {/* The most-read part of the drawer, so only this gets a surface and an indigo line */}
          <div className="rounded-r-lg border-primary border-l-[3px] bg-accent/60 py-3 pr-4 pl-4">
            <Markdown
              issueBaseUrl={issueBaseUrl(s.project?.repo)}
              className="text-[15px] leading-7 [&_li+li]:mt-1 [&_li>ol]:mt-1 [&_li>ul]:mt-1 [&_strong]:font-semibold"
            >
              {section.body}
            </Markdown>
          </div>
          <p className="mt-2 text-muted-foreground text-xs">
            {section.stale && t.staleSummary}
            {section.model && t.madeWith(section.model)}
          </p>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            {busy ? t.summarizingNote : section.summarizable ? t.noSummaryYet : t.shortSection}
          </p>
          {!busy && button(section.summarizable ? t.summarizeNow : t.summarize, Sparkles)}
        </div>
      )}
      {section.error && !busy && <SummaryFailure error={section.error} />}
      {request.isError && <p className="mt-2 text-destructive text-xs">{request.error.message}</p>}
    </Block>
  );
}

function SummaryFailure({ error }: { error: string }) {
  const t = drawerMessages();
  return (
    <div className="mt-2 space-y-1 text-xs">
      <p className="text-destructive">{t.summaryFailed(summaryHint(error))}</p>
      <p className="break-words text-muted-foreground">{t.summaryFailedDetail(error)}</p>
    </div>
  );
}

/**
 * Suggests what to do next from the failure reason (the error output of `claude -p`).
 * Matches the server's own (English) messages.
 */
function summaryHint(error: string): string {
  const t = drawerMessages();
  if (/not logged in|log ?in|authenticat/i.test(error)) return t.hintLogin;
  if (/claude command not found/i.test(error)) return t.hintNoClaude;
  if (/did not finish within|timed out/i.test(error)) return t.hintTimeout;
  if (/rate.?limit|usage limit|overloaded|\b(429|529)\b/i.test(error)) return t.hintRateLimit;
  return t.hintOther;
}

function Block({
  title,
  emphasis = false,
  action,
  children,
}: {
  title: string;
  /** The main block. Its heading is indigo */
  emphasis?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      {/* A rule extends right of the heading, marking block boundaries with a line rather than a surface */}
      <div className="mb-3 flex min-h-7 items-center gap-3">
        <h3
          className={cn(
            "shrink-0 font-semibold text-xs tracking-wide",
            emphasis ? "text-primary" : "text-muted-foreground",
          )}
        >
          {title}
        </h3>
        <span className="h-px flex-1 bg-border" />
        {action}
      </div>
      {children}
    </section>
  );
}

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

/** Fits project, worktree and branch on one line. Long parts are truncated; the tooltip has the full text. */
function ProjectLine({
  project,
  label,
  branch,
}: {
  project: Project | null;
  label: string | null;
  branch: string | null;
}) {
  const showBranch = branch && branch !== "HEAD";
  return (
    <p
      className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs"
      title={[project?.repo, project?.path, label, showBranch ? branch : null]
        .filter(Boolean)
        .join("\n")}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: projectColor(project) }}
      />
      <span className="shrink-0 font-medium text-foreground">
        {project?.name ?? drawerMessages().unknownProject}
      </span>
      {label && (
        <>
          <span aria-hidden>/</span>
          <span className="min-w-0 truncate">{label}</span>
        </>
      )}
      {showBranch && (
        <span className="ml-1 inline-flex min-w-0 shrink items-center gap-1">
          <GitBranch className="size-3 shrink-0" />
          <span className="truncate font-mono text-[11px]">{branch}</span>
        </span>
      )}
    </p>
  );
}

/**
 * When and how long (today / yesterday as words), then the key figures (Claude's time, tokens,
 * cost, outcomes, snags) on a line below. The heading stays put, so stepping with j / k compares them in one place; the
 * breakdown is in "Numbers" below. Figures that are zero are left out.
 */
function SectionTime({ session: s, section }: { session: SessionDetail; section: Section }) {
  const t = drawerMessages();
  const f = formatMessages();
  const u = section.usage;
  const a = section.activity;
  const trouble = troubleCount(a);
  const sameDay = isSameDay(section.start, section.end);
  const last = section === s.sections.at(-1);
  const day = relativeDay(section.start) ?? dateLabel(section.start);
  const range = sameDay
    ? `${day} ${hhmm(section.start)}–${hhmm(section.end)}`
    : `${day} ${hhmm(section.start)} – ${dateLabel(section.end)} ${hhmm(section.end)}`;
  // When on the first line, figures on the second: wrapping one long line used to strand the
  // last figure on a line of its own
  const figures = Boolean(a.claudeMs || u || a.commits + a.prs > 0 || trouble > 0);
  return (
    <div className="mt-2 flex flex-col gap-1 font-num text-muted-foreground text-xs">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">{range}</span>
        <span className="whitespace-nowrap">{durationLabel(section.end - section.start)}</span>
        {s.active && last && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-primary">
            <span className="size-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
            {t.active}
          </span>
        )}
      </p>
      {figures && (
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {a.claudeMs ? (
            <Hint text={t.claudeTimeNote} className="whitespace-nowrap">
              {t.claudeShort(durationLabel(a.claudeMs))}
            </Hint>
          ) : null}
          {u && <span className="whitespace-nowrap">{t.tokens(tokensLabel(u.tokens))}</span>}
          {u && (
            <Hint text={u.unpriced ? t.costNoteUnpriced : t.costNote} className="whitespace-nowrap">
              {u.unpriced ? "~" : ""}
              {costLabel(u.costUsd)}
            </Hint>
          )}
          {/* Icons rather than words keep the line short, as on the calendar's day headers */}
          {a.commits + a.prs > 0 && (
            <Hint
              text={f.commitsPrs(a.commits, a.prs)}
              className="inline-flex items-center gap-1.5"
            >
              {a.commits > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <GitCommitHorizontal className="size-3" />
                  {a.commits}
                </span>
              )}
              {a.prs > 0 && (
                <span className="inline-flex items-center gap-0.5 text-primary">
                  <GitPullRequest className="size-3" />
                  {a.prs}
                </span>
              )}
            </Hint>
          )}
          {trouble > 0 && (
            <Hint text={troubleDetail(a)} className="whitespace-nowrap text-foreground/80">
              {t.troubleCount(trouble)}
            </Hint>
          )}
        </p>
      )}
    </div>
  );
}
