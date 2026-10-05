import type { Artifact, Project, Section, SessionDetail, Subagent, Usage } from "@shared/api.ts";
import { ARTIFACT_GRACE_MS } from "@shared/constants.ts";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { useRequestSummary, useSession } from "@/hooks/queries.ts";
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
import { cn } from "@/lib/utils.ts";
import { Conversation } from "./Conversation.tsx";
import { Hint } from "./Hint.tsx";
import { Markdown } from "./Markdown.tsx";

interface Props {
  id: string;
  /** 選んだセクションの開始時刻。null なら最後のセクション。 */
  at: number | null;
  onClose: () => void;
  onSelect: (id: string, at: number | null) => void;
  /** 時刻順で前・次の作業へ移る。端なら null。 */
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}

/** 右側の詳細。見出しは上に固定し、その下に要約 → セッションの流れ → 成果 → 会話 → 数字を並べる。 */
export function SessionDrawer({ id, at, onClose, onSelect, onPrev, onNext }: Props) {
  const { data, isPending, isError, error } = useSession(id);
  // 会話と数字は補助の情報なので畳んでおく。開いたらドロワーを閉じるまで開いたままにする
  // （j / k で別の作業へ移っても、同じ見え方で比べられるように）
  const [showConversation, setShowConversation] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const section = data
    ? (data.sections.find((x) => x.start === at) ?? data.sections.at(-1) ?? null)
    : null;

  // 狭い画面ではカレンダーの上に重ねるので、開いたらフォーカスをドロワーへ移す
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (matchMedia("(width < 64rem)").matches) asideRef.current?.focus();
  }, []);

  // 別の作業へ移ったら先頭（要約）から見せる。j / k で続けて読むときに、前の位置が残らないように。
  // 会話を開いているときは、会話が選んだ時間の発言へ移すので触らない
  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationOpen = useRef(showConversation);
  conversationOpen.current = showConversation;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 選んだ作業が変わったときだけ動かす
  useEffect(() => {
    if (!conversationOpen.current) scrollRef.current?.scrollTo({ top: 0 });
  }, [id, at]);

  return (
    <>
      {/* 狭い画面で重ねたときだけ、背景を暗くして外側のクリックで閉じられるようにする */}
      <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={onClose} aria-hidden />
      <aside
        ref={asideRef}
        tabIndex={-1}
        className={cn(
          "flex w-full shrink-0 flex-col border-l bg-card outline-none",
          "max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:max-w-md max-lg:shadow-2xl",
          "lg:w-[26rem] xl:w-[30rem]",
        )}
        aria-label="セッションの詳細"
      >
        {/* 見出しはスクロールさせない。会話まで下りても、どの作業の詳細かが分かるように */}
        <header className="shrink-0 border-b px-4 pt-2 pb-4">
          {/* 1 行目にどこの作業か（プロジェクト・worktree・ブランチ）と操作を置き、見出しに幅を回す */}
          <div className="flex h-9 items-center gap-2">
            <div className="min-w-0 flex-1">
              {data && (
                <ProjectLine project={data.project} label={data.label} branch={data.branch} />
              )}
            </div>
            <div className="-mr-1.5 flex shrink-0 items-center">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onPrev ?? undefined}
                disabled={!onPrev}
                aria-label="前の作業（k）"
                title="前の作業（k）"
              >
                <ChevronUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onNext ?? undefined}
                disabled={!onNext}
                aria-label="次の作業（j）"
                title="次の作業（j）"
              >
                <ChevronDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                aria-label="詳細を閉じる（Esc）"
                title="詳細を閉じる（Esc）"
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
          {isPending && <p className="text-muted-foreground text-sm">読み込み中…</p>}
          {isError && (
            <p className="text-destructive text-sm">
              セッションを読み込めませんでした: {error.message}
            </p>
          )}
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

function DetailHeader({
  session: s,
  section,
}: {
  session: SessionDetail;
  section: Section | null;
}) {
  const headline = section?.headline ?? s.title;
  return (
    // 左の色の線で、カレンダーのどのブロックの詳細かを結びつける
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
  const [agent, setAgent] = useState<string | null>(null);
  const multiSection = section !== null && s.sections.length > 1;
  // 開いた状態で別のブロックへ移ったときも、選んだ時間の会話から見せる
  const [jump, setJump] = useState<{ ts: number; key: number } | null>(
    multiSection && section ? { ts: section.start, key: 0 } : null,
  );
  const openConversation = () => {
    if (multiSection && section) setJump((j) => ({ ts: section.start, key: (j?.key ?? 0) + 1 }));
    onShowConversation(true);
  };

  // 開いた会話は下へ読み込み続けるので、その後ろに置くと数字にたどり着けない。開いているときは会話の前に出す
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
          title="会話"
          action={
            <div className="flex items-center gap-1">
              {multiSection && agent === null && (
                <Button variant="outline" size="xs" onClick={openConversation}>
                  この時間の会話へ
                </Button>
              )}
              <Button variant="ghost" size="xs" onClick={() => onShowConversation(false)}>
                畳む
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
          {multiSection ? "この時間の会話を表示" : "会話を表示"}
          {s.subagents.length > 0 && (
            <span className="ml-auto text-xs">サブエージェント {s.subagents.length}</span>
          )}
        </button>
      )}

      {!showConversation && numbers}
    </div>
  );
}

/**
 * 使用量と活動。振り返りの主役（何をしたか）ではないので畳んでおき、要点だけを 1 行で見せる。
 * 要件定義でコスト・トークンの分析はスコープ外としており、作業が数字に埋もれないようにするため。
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
        数字
        <span className="ml-auto truncate font-num text-xs">
          {[
            u && `${tokensLabel(u.tokens)} トークン`,
            u && `${u.unpriced ? "~" : ""}${costLabel(u.costUsd)}`,
            trouble > 0 && `つまずき ${trouble}`,
          ]
            .filter(Boolean)
            .join("・")}
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
            畳む
          </Button>
        }
      />
      {section && <ActivityBlock section={section} />}
    </div>
  );
}

const COST_NOTE = "API の料金表で換算した目安（サブスクリプションでの支払いとは一致しない）";

/** 選んだ時間のトークン使用量と内訳。区間が複数あれば、セッション全体の合計も添える。 */
function UsageBlock({
  session: s,
  section,
  action,
}: {
  session: SessionDetail;
  section: Section | null;
  action?: React.ReactNode;
}) {
  const u = section ? section.usage : s.usage;
  const rate = u ? cacheRate(u) : null;
  const showTotal = s.usage && section && (s.sections.length > 1 || u?.tokens !== s.usage.tokens);
  return (
    <Block title={section ? "この時間の使用量" : "使用量"} action={action}>
      {u ? (
        <>
          <dl className="grid grid-cols-4 gap-2">
            <Stat label="トークン" value={tokensLabel(u.tokens)} />
            <Stat
              label="API 料金換算"
              value={`${u.unpriced ? "~" : ""}${costLabel(u.costUsd)}`}
              title={u.unpriced ? `${COST_NOTE}。料金の分からないモデルの分を含まない` : COST_NOTE}
            />
            <Stat
              label="キャッシュ"
              value={rate === null ? "—" : `${Math.round(rate * 100)}%`}
              title="入力のうちキャッシュから読んだ割合"
            />
            <Stat label="発言" value={String(section?.promptCount ?? s.promptCount)} />
          </dl>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 font-num text-muted-foreground text-xs">
            <span>入力 {tokensLabel(u.input)}</span>
            <span>出力 {tokensLabel(u.output)}</span>
            <span>キャッシュ読み込み {tokensLabel(u.cacheRead)}</span>
            <span>書き込み {tokensLabel(u.cacheWrite)}</span>
            {u.model && <span>{modelLabel(u.model)}</span>}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          この時間のトークン使用量の記録はありません。
        </p>
      )}
      {showTotal && s.usage && <SessionTotal session={s} usage={s.usage} />}
    </Block>
  );
}

/** 選んだ時間にしたこと。数が 0 のものも並べ、何もなかったことが分かるようにする。 */
function ActivityBlock({ section }: { section: Section }) {
  const a = section.activity;
  const span = section.end - section.start;
  const trouble = troubleCount(a);
  const items: [string, React.ReactNode, string?][] = [
    [
      "Claude の稼働",
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
      "Claude がターンを進めていた時間（考える・ツールを動かす）。括弧はこの時間の長さに対する割合",
    ],
    ["コミット・PR", `${a.commits}・${a.prs}`],
    ["編集したファイル", a.filesEdited],
    ["ツール呼び出し", a.toolCalls, "サブエージェントの分を含む"],
    ["サブエージェント", a.subagents],
    [
      "つまずき",
      <span key="t" className={cn(trouble > 0 && "text-warn")}>
        {trouble}
        {trouble > 0 && (
          <span className="block font-normal text-muted-foreground text-xs">
            {troubleDetail(a)}
          </span>
        )}
      </span>,
      "ツールのエラー・人による中断・API のエラー",
    ],
    ["会話の圧縮", a.compactions, "compaction の回数"],
    ["effort", a.effort ?? "—", "出力トークンがいちばん多い effort"],
  ];
  return (
    <Block title="この時間の活動">
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
  return (
    <p className="mt-3 border-t pt-2 text-muted-foreground text-xs">
      セッション全体（{s.sections.length} 区間
      {s.scheduledRuns > 0 && `・自動実行 ${s.scheduledRuns} 回を含む`}）:{" "}
      <span className="font-medium font-num text-foreground">{tokensLabel(usage.tokens)}</span>{" "}
      トークン・
      <Hint className="font-medium font-num text-foreground" text={COST_NOTE}>
        {usage.unpriced ? "~" : ""}
        {costLabel(usage.costUsd)}
      </Hint>
    </p>
  );
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0 rounded-md border px-2.5 py-1.5">
      <dt className="truncate text-[11px] text-muted-foreground">
        <Hint text={title} focusable>
          {label}
        </Hint>
      </dt>
      <dd className="font-medium font-num text-base tabular-nums">{value}</dd>
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

      {s.awaySummary && <AwaySummary text={s.awaySummary} />}

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

/** Claude Code が残した振り返り。長く英語のことも多いので、3 行に抑えて開けるようにする。 */
function AwaySummary({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="mt-3 block w-full border-l-2 pl-3 text-left text-muted-foreground text-xs leading-relaxed hover:text-foreground"
    >
      <span className="mb-0.5 block font-medium">Claude Code の振り返り</span>
      <span className={cn("block", !open && "line-clamp-3")}>{text}</span>
    </button>
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
  const inSection = (a: Artifact) =>
    a.ts !== null && a.ts >= section.start && a.ts <= section.end + ARTIFACT_GRACE_MS;
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
 * PR のリンク。番号は URL から取り、題名と並べる。題名が取れなかった PR（`--fill` で作ったものなど）は
 * 「#番号 リポジトリ」になっているので、リポジトリ名を補助として出す。
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
 * 会話の切り替え。メインと、サブエージェントを選ぶ 1 つの選択欄を 1 行に並べる。
 * サブエージェントは数十になることがあり、タブにすると会話が下へ押し出されるため。
 * 選択欄では、選んだ時間に動いたものを先に出す。
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
      {a.agentType ?? "サブエージェント"}
      {a.description ? `: ${a.description}` : ""}
    </option>
  );

  return (
    <div className="mb-3 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Tab active={agent === null} onClick={() => onChange(null)}>
          メイン
        </Tab>
        <select
          aria-label="サブエージェントの会話"
          className={cn(
            "min-w-0 flex-1 truncate rounded-full border bg-transparent px-2.5 py-0.5 text-xs",
            selected ? "border-primary text-foreground" : "text-muted-foreground",
          )}
          value={agent ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">サブエージェント（{s.subagents.length}）</option>
          {here.length > 0 && <optgroup label="この時間">{here.map(option)}</optgroup>}
          {others.length > 0 && (
            <optgroup label={here.length > 0 ? "ほかの時間" : "このセッション"}>
              {others.map(option)}
            </optgroup>
          )}
        </select>
      </div>
      {selected?.description && (
        <p className="text-muted-foreground text-xs">
          {selected.agentType ?? "サブエージェント"}への依頼: {selected.description}
        </p>
      )}
    </div>
  );
}

/** 選んだセクションの要約。なければ作るボタン。短いセクションはその旨を出す。 */
function SectionSummary({ session: s, section }: { session: SessionDetail; section: Section }) {
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
      {busy ? "要約を作成中…" : label}
    </Button>
  );

  return (
    <Block
      title="この時間の要約"
      emphasis
      action={section.body ? button("作り直す", RefreshCw) : null}
    >
      {section.body ? (
        <>
          {/* ドロワーで一番読む部分なので、ここだけ面と藍の線で浮かせる */}
          <div className="rounded-r-lg border-primary border-l-[3px] bg-accent/60 py-3 pr-4 pl-4">
            <Markdown
              issueBaseUrl={issueBaseUrl(s.project?.repo)}
              className="text-[15px] leading-7 [&_li+li]:mt-1 [&_li>ol]:mt-1 [&_li>ul]:mt-1 [&_strong]:font-semibold"
            >
              {section.body}
            </Markdown>
          </div>
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
      {section.error && !busy && <SummaryFailure error={section.error} />}
      {request.isError && <p className="mt-2 text-destructive text-xs">{request.error.message}</p>}
    </Block>
  );
}

function SummaryFailure({ error }: { error: string }) {
  return (
    <div className="mt-2 space-y-1 text-xs">
      <p className="text-destructive">要約できませんでした。{summaryHint(error)}</p>
      <p className="break-words text-muted-foreground">詳細: {error}</p>
    </div>
  );
}

/** 要約の失敗理由（`claude -p` のエラー出力）から、次にすることを案内する。 */
function summaryHint(error: string): string {
  if (/not logged in|log ?in|authenticat/i.test(error))
    return "Claude Code にログインしていません。ターミナルで claude を起動してログインしてから、もう一度要約してください。";
  if (error.includes("claude コマンドが見つかりません"))
    return "claude コマンドが見つかりません。Claude Code をインストールしてから、kairos restart で起動し直してください。";
  if (error.includes("以内に終わりませんでした"))
    return "時間がかかりすぎました。少し待ってから、もう一度要約してください。";
  if (/rate.?limit|usage limit|overloaded|\b(429|529)\b/i.test(error))
    return "利用上限か混雑で断られました。時間をおいて、もう一度要約してください。";
  return "時間をおいて、もう一度要約してください。続くときは ~/Library/Logs/kairos/server.log を確認してください。";
}

function Block({
  title,
  emphasis = false,
  action,
  children,
}: {
  title: string;
  /** 主役のブロック。見出しを藍にする */
  emphasis?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      {/* 見出しの右に罫線を伸ばし、ブロックの境目を面ではなく線で示す */}
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

/** プロジェクト・worktree・ブランチを 1 行に収める。長いものは省略し、全体はツールチップで読む。 */
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
        {project?.name ?? "プロジェクト不明"}
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

/** 選んだ時間。日付は今日・昨日なら言葉で出し、長さとコストを点で区切って並べる。 */
function SectionTime({ session: s, section }: { session: SessionDetail; section: Section }) {
  const sameDay = isSameDay(section.start, section.end);
  const last = section === s.sections.at(-1);
  const day = relativeDay(section.start) ?? dateLabel(section.start);
  const range = sameDay
    ? `${day} ${hhmm(section.start)}–${hhmm(section.end)}`
    : `${day} ${hhmm(section.start)} – ${dateLabel(section.end)} ${hhmm(section.end)}`;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-num text-muted-foreground text-xs">
      <span className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">{range}</span>
      <span className="whitespace-nowrap">{durationLabel(section.end - section.start)}</span>
      {/* 区間の番号は「セッションの流れ」で分かるので出さず、要点の数字としてコストだけ添える */}
      {section.usage && (
        <>
          <span aria-hidden>·</span>
          <Hint text={COST_NOTE} className="whitespace-nowrap">
            {section.usage.unpriced ? "~" : ""}
            {costLabel(section.usage.costUsd)}
          </Hint>
        </>
      )}
      {s.active && last && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-primary">
          <span className="size-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
          作業中
        </span>
      )}
    </p>
  );
}
