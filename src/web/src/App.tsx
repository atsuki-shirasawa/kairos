import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo } from "react";
import { CalendarGrid } from "@/components/CalendarGrid.tsx";
import { SessionDrawer } from "@/components/SessionDrawer.tsx";
import { Toolbar } from "@/components/Toolbar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useCalendar } from "@/hooks/queries.ts";
import { useLiveUpdates } from "@/hooks/useLiveUpdates.ts";
import { useNow } from "@/hooks/useNow.ts";
import { useSystemTheme } from "@/hooks/useTheme.ts";
import { useUrlState } from "@/hooks/useUrlState.ts";
import { dateLabel, rangeOf, shift, startOfDay } from "@/lib/dates.ts";

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
  const visible = useMemo(
    () =>
      (calendar.data?.sessions ?? []).filter(
        (s) => s.projectId === null || !projectMap.get(s.projectId)?.hidden,
      ),
    [calendar.data, projectMap],
  );

  // ← → で前後へ、t で今日、w / d で週・日、Esc で詳細を閉じる
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
      else if (e.key === "Escape" && state.session) update({ session: null, at: null });
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [state.view, state.anchor, state.session, update]);

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        view={state.view}
        anchor={state.anchor}
        projects={projects}
        sessions={calendar.data?.sessions ?? []}
        progress={progress}
        onView={(view) => update({ view })}
        onMove={(dir) => update({ anchor: shift(state.view, state.anchor, dir) })}
        onToday={() => update({ anchor: startOfDay(Date.now()) })}
      />
      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col">
          <CalendarGrid
            days={days}
            sessions={visible}
            projects={projectMap}
            selectedId={state.session}
            selectedAt={state.at}
            now={now}
            onSelect={(session, at) => update({ session, at }, { push: true })}
            onOpenDay={(day) => update({ view: "day", anchor: day })}
          />
          {calendar.isError && (
            <Notice>
              Kairos のサーバーに接続できません。ターミナルで <code>kairos ensure</code>{" "}
              を実行すると起動します。
            </Notice>
          )}
          {calendar.isSuccess && visible.length === 0 && (
            <EmptyNotice
              period={state.view === "week" ? "この週" : "この日"}
              progress={progress}
              hiddenOnly={calendar.data.sessions.length > 0}
              prev={calendar.data.prev}
              next={calendar.data.next}
              onJump={(t) => update({ anchor: startOfDay(t) })}
            />
          )}
        </main>
        {state.session && (
          <SessionDrawer
            id={state.session}
            at={state.at}
            onClose={() => update({ session: null, at: null })}
            onSelect={(session, at) => update({ session, at }, { push: true })}
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
  hiddenOnly,
  prev,
  next,
  onJump,
}: {
  period: string;
  progress: { done: number; total: number } | null;
  hiddenOnly: boolean;
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
  if (hiddenOnly)
    return (
      <Notice>
        {period}
        の記録は、すべて非表示のプロジェクトのものです。右上の「プロジェクト」から表示を戻せます。
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
            前の記録（{dateLabel(prev)}）
          </Button>
        )}
        {next !== null && (
          <Button variant="outline" size="xs" onClick={() => onJump(next)}>
            次の記録（{dateLabel(next)}）
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
