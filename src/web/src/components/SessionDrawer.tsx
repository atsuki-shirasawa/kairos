import type { Artifact, Project, Section, SessionDetail, Subagent } from "@shared/api.ts";
import {
  ExternalLink,
  GitCommitHorizontal,
  GitPullRequest,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { useRequestSummary, useSession } from "@/hooks/queries.ts";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel, durationLabel, hhmm, isSameDay } from "@/lib/dates.ts";
import { cn } from "@/lib/utils.ts";
import { Conversation } from "./Conversation.tsx";
import { Markdown } from "./Markdown.tsx";

interface Props {
  id: string;
  /** 選んだセクションの開始時刻。null なら最後のセクション。 */
  at: number | null;
  onClose: () => void;
  onSelect: (id: string, at: number | null) => void;
}

/** 右側の詳細。見出しは上に固定し、その下に要約 → セッションの流れ → 成果 → 会話を並べる。 */
export function SessionDrawer({ id, at, onClose, onSelect }: Props) {
  const { data, isPending, isError, error } = useSession(id);
  const section = data
    ? (data.sections.find((x) => x.start === at) ?? data.sections.at(-1) ?? null)
    : null;

  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col border-l bg-card",
        "max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:max-w-md max-lg:shadow-2xl",
        "lg:w-[26rem] xl:w-[30rem]",
      )}
      aria-label="セッションの詳細"
    >
      {/* 見出しはスクロールさせない。会話まで下りても、どの作業の詳細かが分かるように */}
      <header className="flex min-h-14 shrink-0 items-start gap-2 border-b py-3 pr-3 pl-5">
        <div className="min-w-0 flex-1">
          {data && <DetailHeader session={data} section={section} />}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="詳細を閉じる">
          <X />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-10" data-drawer-scroll>
        {isPending && <p className="text-muted-foreground text-sm">読み込み中…</p>}
        {isError && (
          <p className="text-destructive text-sm">
            セッションを読み込めませんでした: {error.message}
          </p>
        )}
        {data && <Detail key={data.id} session={data} section={section} onSelect={onSelect} />}
      </div>
    </aside>
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
    <div className="space-y-1">
      <h2
        className="line-clamp-2 text-balance font-semibold text-base leading-snug"
        title={headline}
      >
        {headline}
      </h2>
      {section && section.headline !== s.title && (
        <p className="line-clamp-1 text-muted-foreground text-xs" title={s.title}>
          {s.title}
        </p>
      )}
      <ProjectLine project={s.project} label={s.label} branch={s.branch} />
      {section && <SectionTime session={s} section={section} />}
    </div>
  );
}

function Detail({
  session: s,
  section,
  onSelect,
}: {
  session: SessionDetail;
  section: Section | null;
  onSelect: Props["onSelect"];
}) {
  const [agent, setAgent] = useState<string | null>(null);
  const [jump, setJump] = useState<{ ts: number; key: number } | null>(null);

  return (
    <div className="space-y-7">
      {section && <SectionSummary sessionId={s.id} section={section} />}

      {(s.sections.length > 1 || s.awaySummary || s.continuedFrom || s.continuedIn) && (
        <Flow session={s} section={section} onSelect={onSelect} />
      )}

      {(s.commits.length > 0 || s.prs.length > 0) && section && (
        <Outcomes session={s} section={section} />
      )}

      <Block
        title="会話"
        action={
          section && s.sections.length > 1 && agent === null ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() => setJump((j) => ({ ts: section.start, key: (j?.key ?? 0) + 1 }))}
            >
              この時間の会話へ
            </Button>
          ) : null
        }
      >
        <AgentTabs session={s} section={section} agent={agent} onChange={setAgent} />
        <Conversation sessionId={s.id} agent={agent} jump={agent === null ? jump : null} />
      </Block>
    </div>
  );
}

/** 区間がこれより多いときは、選んだ区間の前後だけを出して残りは畳む。 */
const FLOW_LIMIT = 6;

/**
 * セッションの流れ（全区間の見出し）と、セッション全体についての補足。
 * 要約のない区間は最初の発言がそのまま入って長くなるので、1 行に抑えて控えめに出す。
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
      title="セッションの流れ"
      action={
        s.sections.length > FLOW_LIMIT ? (
          <Button variant="ghost" size="xs" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "前後だけ表示" : `すべて表示（${s.sections.length}）`}
          </Button>
        ) : null
      }
    >
      {hiddenBefore > 0 && <Hidden count={hiddenBefore} where="前" />}
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
                    "flex w-full items-baseline gap-3 rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
                    selected && "bg-accent font-medium",
                  )}
                >
                  <span className="w-28 shrink-0 font-num text-muted-foreground text-xs">
                    {/* 日をまたぐセッションでは、最初の区間も含めてすべてに日付を付ける */}
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
      {hiddenAfter > 0 && <Hidden count={hiddenAfter} where="後" />}

      {s.awaySummary && (
        <p className="mt-3 text-muted-foreground text-xs leading-relaxed">
          Claude Code の振り返り: {s.awaySummary}
        </p>
      )}

      {(s.continuedFrom || s.continuedIn) && (
        <div className="mt-3 flex gap-4 text-sm">
          {s.continuedFrom && (
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => onSelect(s.continuedFrom ?? "", null)}
            >
              前のセッションへ
            </button>
          )}
          {s.continuedIn && (
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => onSelect(s.continuedIn ?? "", null)}
            >
              続きのセッションへ
            </button>
          )}
        </div>
      )}
    </Block>
  );
}

function Hidden({ count, where }: { count: number; where: "前" | "後" }) {
  return (
    <p className="px-2 py-0.5 text-muted-foreground text-xs">
      {where === "前" ? "︙ この前に" : "︙ この後に"} {count} 区間
    </p>
  );
}

/** この時間の成果は最初にこの件数だけ出し、残りは畳む。会話までの距離を縮めるため。 */
const OUTCOME_LIMIT = 5;

/** 成果。選んだ時間のものを先に出し、セッション全体のものは畳んでおく。 */
function Outcomes({ session: s, section }: { session: SessionDetail; section: Section }) {
  const all = [...s.prs, ...s.commits];
  // PR のリンクは作成の少し後に記録されることがあるので、終わりに 5 分の余裕を持たせる
  const inSection = (a: Artifact) =>
    a.ts !== null && a.ts >= section.start && a.ts <= section.end + 5 * 60_000;
  const here = all.filter(inSection);
  const rest = all.filter((a) => !inSection(a));
  return (
    <Block title="この時間の成果">
      {here.length > 0 ? (
        <>
          <ArtifactList items={here.slice(0, OUTCOME_LIMIT)} />
          {here.length > OUTCOME_LIMIT && (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-muted-foreground text-xs">
                ほか {here.length - OUTCOME_LIMIT} 件
              </summary>
              <div className="mt-1.5">
                <ArtifactList items={here.slice(OUTCOME_LIMIT)} />
              </div>
            </details>
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">この時間のコミットや PR はありません。</p>
      )}
      {rest.length > 0 && (
        <details className="group mt-3">
          <summary className="cursor-pointer text-muted-foreground text-xs">
            セッション全体の成果（ほか {rest.length} 件）
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
    <ul className="space-y-1.5 text-sm">
      {items.map((a) =>
        a.kind === "pr" ? (
          <li key={a.ref} className="flex items-center gap-2">
            <GitPullRequest className="size-4 shrink-0 text-muted-foreground" />
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
 * PR のリンク。ログには PR の題名がなく「#番号 リポジトリ」しか残らないので、
 * 番号を主に、リポジトリ名を補助として出す。
 */
function PrLink({ artifact: a }: { artifact: Artifact }) {
  const [, num, repo] = /^(#\d+)\s+(.+)$/.exec(a.title ?? "") ?? [];
  return (
    <a
      href={a.ref}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-w-0 items-baseline gap-1.5 text-primary hover:underline"
    >
      {num ? (
        <>
          <span className="font-medium font-num">{num}</span>
          <span className="truncate text-muted-foreground text-xs">{repo}</span>
        </>
      ) : (
        <span className="truncate">{a.title ?? a.ref}</span>
      )}
      <ExternalLink className="size-3 shrink-0 self-center" />
    </a>
  );
}

/** 会話の切り替え。選んだ時間に動いたサブエージェントだけをタブにし、ほかは選択肢にまとめる。 */
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
  if (s.subagents.length === 0) return null;
  const during = (a: Subagent) =>
    section !== null &&
    a.startedAt !== null &&
    a.endedAt !== null &&
    a.startedAt <= section.end &&
    a.endedAt >= section.start;
  const here = s.subagents.filter(during);
  const others = s.subagents.filter((a) => !during(a));
  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-1.5"
      role="tablist"
      aria-label="会話の切り替え"
    >
      <Tab active={agent === null} onClick={() => onChange(null)}>
        メイン
      </Tab>
      {here.map((a) => (
        <Tab
          key={a.id}
          active={agent === a.id}
          onClick={() => onChange(a.id)}
          title={a.description ?? undefined}
        >
          {a.agentType ?? "サブエージェント"}
        </Tab>
      ))}
      {others.length > 0 && (
        <select
          aria-label="ほかの時間のサブエージェント"
          className="rounded-full border bg-transparent px-2 py-0.5 text-muted-foreground text-xs"
          value={others.some((a) => a.id === agent) ? (agent ?? "") : ""}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">ほかの時間（{others.length}）</option>
          {others.map((a) => (
            <option key={a.id} value={a.id}>
              {a.startedAt ? `${hhmm(a.startedAt)} ` : ""}
              {a.agentType ?? "サブエージェント"}
              {a.description ? `: ${a.description}` : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** 選んだセクションの要約。なければ作るボタン。短いセクションはその旨を出す。 */
function SectionSummary({ sessionId, section }: { sessionId: string; section: Section }) {
  const request = useRequestSummary(sessionId);
  const busy = section.pending || request.isPending;
  const button = (label: string, Icon: typeof Sparkles) => (
    <Button
      variant="outline"
      size="xs"
      onClick={() => request.mutate(section.start)}
      disabled={busy}
    >
      <Icon className={cn(busy && "animate-spin motion-reduce:animate-none")} />
      {busy ? "要約を作成中…" : label}
    </Button>
  );

  return (
    <Block title="この時間の要約" action={section.body ? button("作り直す", RefreshCw) : null}>
      {section.body ? (
        <>
          <Markdown>{section.body}</Markdown>
          <p className="mt-2 text-muted-foreground text-xs">
            {section.stale && "要約の後も作業が続いています。"}
            {section.model && `${section.model} で作成`}
          </p>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            {busy
              ? "要約を作っています（20 秒ほどかかります）。"
              : section.summarizable
                ? "まだ要約はありません。作業が止まって 30 分たつと自動で作ります。"
                : "短い作業なので、最初の発言を見出しにしています。"}
          </p>
          {!busy && button(section.summarizable ? "いま要約する" : "要約する", Sparkles)}
        </div>
      )}
      {section.error && !busy && (
        <p className="mt-2 text-destructive text-xs">要約できませんでした: {section.error}</p>
      )}
      {request.isError && <p className="mt-2 text-destructive text-xs">{request.error.message}</p>}
    </Block>
  );
}

function Block({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex min-h-7 items-center justify-between gap-2">
        <h3 className="font-medium text-muted-foreground text-sm">{title}</h3>
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
      role="tab"
      aria-selected={active}
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

function ProjectLine({
  project,
  label,
  branch,
}: {
  project: Project | null;
  label: string | null;
  branch: string | null;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span
        className="inline-flex items-center gap-1.5"
        title={project?.repo ? `${project.repo}\n${project.path}` : project?.path}
      >
        <span className="size-2.5 rounded-sm" style={{ background: projectColor(project) }} />
        {project?.name ?? "プロジェクト不明"}
      </span>
      {label && <span className="text-muted-foreground">{label}</span>}
      {branch && branch !== "HEAD" && (
        <code className="text-muted-foreground text-xs">{branch}</code>
      )}
    </p>
  );
}

function SectionTime({ session: s, section }: { session: SessionDetail; section: Section }) {
  const sameDay = isSameDay(section.start, section.end);
  const last = section === s.sections.at(-1);
  return (
    <p className="font-num text-muted-foreground text-sm">
      {dateLabel(section.start)} {hhmm(section.start)}–{sameDay ? "" : `${dateLabel(section.end)} `}
      {hhmm(section.end)}
      <span className="ml-2">{durationLabel(section.end - section.start)}</span>
      {s.active && last && <span className="ml-2 text-primary">作業中</span>}
      {s.sections.length > 1 && (
        <span className="ml-2">
          {s.sections.indexOf(section) + 1} / {s.sections.length} 区間
        </span>
      )}
    </p>
  );
}
