import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarGrid } from "@/components/CalendarGrid.tsx";
import { SessionDrawer } from "@/components/SessionDrawer.tsx";
import { SessionList } from "@/components/SessionList.tsx";
import { Toolbar } from "@/components/Toolbar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useCalendar } from "@/hooks/queries.ts";
import { useLiveUpdates } from "@/hooks/useLiveUpdates.ts";
import { useNow } from "@/hooks/useNow.ts";
import { useSystemTheme } from "@/hooks/useTheme.ts";
import { useUrlState } from "@/hooks/useUrlState.ts";
import { dateLabel, rangeOf, shift, startOfDay } from "@/lib/dates.ts";
import {
  type Filter,
  hideSessions,
  isFocused,
  NO_FILTER,
  narrowSessions,
  segmentMatcher,
} from "@/lib/filter.ts";
import { orderedBlocks, selectedSegment, stepBlock } from "@/lib/navigation.ts";

export function App() {
  useSystemTheme();
  const [state, update] = useUrlState();
  const now = useNow();
  const progress = useLiveUpdates();
  const { from, to, days } = useMemo(
    () => rangeOf(state.view, state.anchor),
    [state.view, state.anchor],
  );
  const calendar = useCalendar(from, to);

  const projects = calendar.data?.projects ?? [];
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const sessions = calendar.data?.sessions ?? [];
  const visible = useMemo(
    () => hideSessions(calendar.data?.sessions ?? [], projectMap, state.filter),
    [calendar.data, projectMap, state.filter],
  );
  const matches = useMemo(
    () => segmentMatcher(state.filter, projectMap),
    [state.filter, projectMap],
  );
  const focused = useMemo(() => narrowSessions(visible, matches), [visible, matches]);
  const setFilter = useCallback((filter: Filter) => update({ filter }), [update]);

  // 時刻順に前後の作業へ移る（j / k とドロワーの ↑ ↓）。履歴は積まず、戻るボタンで一つずつ戻らずに済むようにする。
  // 絞り込み中は、条件に合う作業だけをたどる
  const ordered = useMemo(() => orderedBlocks(focused, from, to), [focused, from, to]);
  const currentAt = selectedSegment(visible, state.session, state.at)?.start ?? state.at;
  const current = state.session && currentAt !== null ? { id: state.session, at: currentAt } : null;
  const prev = stepBlock(ordered, current, -1);
  const next = stepBlock(ordered, current, 1);
  const goTo = useCallback(
    (b: { id: string; at: number } | null) => b && update({ session: b.id, at: b.at }),
    [update],
  );

  // 閉じたら、開いたブロック（行）へフォーカスを戻す。キーボードで続けてたどれるように
  const closeDrawer = useCallback(() => {
    const el = document.querySelector<HTMLElement>(
      "main button[data-selected], main tr[data-selected] button",
    );
    update({ session: null, at: null });
    el?.focus({ preventScroll: true });
  }, [update]);

  const [helpOpen, setHelpOpen] = useState(false);

  // ← → で前後へ、t で今日、w / d で週・日、c / l でカレンダー・リスト、j / k で次・前の作業、
  // Esc で詳細を閉じる、? で一覧。一覧は Toolbar.tsx の SHORTCUTS
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        target?.closest("input, textarea, [contenteditable]")
      )
        return;
      if (e.key === "ArrowLeft") update({ anchor: shift(state.view, state.anchor, -1) });
      else if (e.key === "ArrowRight") update({ anchor: shift(state.view, state.anchor, 1) });
      else if (e.key === "t") update({ anchor: startOfDay(Date.now()) });
      else if (e.key === "w") update({ view: "week" });
      else if (e.key === "d") update({ view: "day" });
      else if (e.key === "c") update({ layout: "calendar" });
      else if (e.key === "l") update({ layout: "list" });
      else if (e.key === "j") goTo(next ?? null);
      else if (e.key === "k") goTo(prev ?? null);
      // 配列によっては Shift+/ の key が "/" のまま届くので、両方を受け付ける
      else if (e.key === "?" || (e.key === "/" && e.shiftKey)) setHelpOpen((v) => !v);
      // ポップオーバー（一覧・プロジェクト）を開いているときの Esc は、それを閉じるだけにする（ツールチップは除く）。
      // Radix が閉じる前のこの時点では、中身がまだ DOM に残っている
      else if (
        e.key === "Escape" &&
        state.session &&
        !document.querySelector("[data-slot=popover-content]")
      )
        closeDrawer();
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [state.view, state.anchor, state.session, update, goTo, prev, next, closeDrawer]);

  // カレンダーとリストは同じものを描き分けるだけなので、渡すものも同じ
  const body = {
    days,
    sessions: visible,
    projects: projectMap,
    selectedId: state.session,
    selectedAt: state.at,
    now,
    matches,
    onSelect: (session: string, at: number) => update({ session, at }, { push: true }),
    onOpenDay: (day: number) => update({ view: "day", anchor: day }),
  };

  const period = state.view === "week" ? "この週" : "この日";

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        view={state.view}
        layout={state.layout}
        anchor={state.anchor}
        projects={projects}
        sessions={sessions}
        filter={state.filter}
        onFilter={setFilter}
        progress={progress}
        onView={(view) => update({ view })}
        onLayout={(layout) => update({ layout })}
        onMove={(dir) => update({ anchor: shift(state.view, state.anchor, dir) })}
        onToday={() => update({ anchor: startOfDay(Date.now()) })}
        helpOpen={helpOpen}
        onHelpOpen={setHelpOpen}
      />
      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col">
          {state.layout === "list" ? (
            <SessionList {...body} sort={state.sort} onSort={(sort) => update({ sort })} />
          ) : (
            <CalendarGrid {...body} />
          )}
          {calendar.isError && (
            <Notice>
              Kairos のサーバーに接続できません。ターミナルで <code>kairos ensure</code>{" "}
              を実行すると起動します。
            </Notice>
          )}
          {calendar.isSuccess && visible.length === 0 && (
            <EmptyNotice
              period={period}
              progress={progress}
              hiddenBy={
                sessions.length === 0
                  ? null
                  : hideSessions(sessions, projectMap, NO_FILTER).length === 0
                    ? "project"
                    : "brief"
              }
              prev={calendar.data.prev}
              next={calendar.data.next}
              onJump={(t) => update({ anchor: startOfDay(t) })}
            />
          )}
          {visible.length > 0 && focused.length === 0 && isFocused(state.filter) && (
            <Notice>
              <p>{period}に、絞り込みの条件に合う作業はありません。</p>
              <Button
                variant="outline"
                size="xs"
                className="mt-2"
                onClick={() => setFilter({ ...state.filter, q: "", outcome: false })}
              >
                条件を外す
              </Button>
            </Notice>
          )}
        </main>
        {state.session && (
          <SessionDrawer
            id={state.session}
            at={state.at}
            onClose={closeDrawer}
            onSelect={(session, at) => update({ session, at }, { push: true })}
            onPrev={prev ? () => goTo(prev) : null}
            onNext={next ? () => goTo(next) : null}
          />
        )}
      </div>
    </div>
  );
}

/** 期間に表示するものがないとき、その理由と次にできることを出す。 */
function EmptyNotice({
  period,
  progress,
  hiddenBy,
  prev,
  next,
  onJump,
}: {
  period: string;
  progress: { done: number; total: number } | null;
  /** 記録はあるが、すべて隠している。何で隠したか。 */
  hiddenBy: "project" | "brief" | null;
  prev: number | null;
  next: number | null;
  onJump: (t: number) => void;
}) {
  if (progress)
    return (
      <Notice>
        ログを取り込んでいます（{Math.floor((progress.done / Math.max(progress.total, 1)) * 100)}
        %）。終わると、ここに表示されます。
      </Notice>
    );
  if (hiddenBy === "project")
    return (
      <Notice>
        {period}
        の記録は、すべて非表示のプロジェクトのものです。右上の「絞り込み」から表示を戻せます。
      </Notice>
    );
  if (hiddenBy === "brief")
    return (
      <Notice>
        {period}
        の記録は、隠しているちょっとした質問か、非表示のプロジェクトのものです。右上の「絞り込み」から表示を戻せます。
      </Notice>
    );
  if (prev === null && next === null)
    return (
      <Notice>まだ記録がありません。Claude Code で作業すると、数秒でここに表示されます。</Notice>
    );
  return (
    <Notice>
      <p>{period}の記録はありません。</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {prev !== null && (
          <Button variant="outline" size="xs" onClick={() => onJump(prev)}>
            <ChevronLeft />
            前の記録
            <span className="font-num text-muted-foreground">{dateLabel(prev)}</span>
          </Button>
        )}
        {next !== null && (
          <Button variant="outline" size="xs" onClick={() => onJump(next)}>
            次の記録
            <span className="font-num text-muted-foreground">{dateLabel(next)}</span>
            <ChevronRight />
          </Button>
        )}
      </div>
    </Notice>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center px-4">
      <div
        className="pointer-events-auto rounded-md border bg-popover px-4 py-2 text-center text-muted-foreground text-sm shadow-sm"
        role="status"
      >
        {children}
      </div>
    </div>
  );
}
