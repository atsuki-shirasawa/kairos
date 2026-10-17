import type { LiveResponse, LiveSession, Project } from "@shared/api.ts";
import { useLastWorkday } from "@/hooks/useLastWorkday.ts";
import type { OpenBlock } from "@/lib/selection.ts";
import { LastWorkday } from "./LastWorkday.tsx";
import { NowSection } from "./NowSection.tsx";

/**
 * The home page: what runs now (what waits on you first), and what the last workday was about.
 * Two columns side by side from `lg`, so both fit a laptop screen without scrolling.
 */
export function TodayPage({
  live,
  sessions,
  projects,
  now,
  selectedId,
  selectedAt,
  onSelect,
  onLive,
  onOpenDay,
}: {
  live: LiveResponse | undefined;
  /** Running sessions, already filtered and ordered (`visibleLive`). */
  sessions: LiveSession[];
  projects: ReadonlyMap<number, Project>;
  now: number;
  selectedId: string | null;
  selectedAt: number | null;
  onSelect: OpenBlock;
  onLive: () => void;
  onOpenDay: (day: number) => void;
}) {
  const workday = useLastWorkday(now, projects);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-card">
      <div className="mx-auto grid max-w-7xl gap-x-10 gap-y-8 px-5 py-6 max-lg:px-3 lg:grid-cols-2">
        <NowSection
          live={live}
          sessions={sessions}
          projects={projects}
          now={now}
          selectedId={selectedId}
          onSelect={onSelect}
          onLive={onLive}
        />
        <LastWorkday
          workday={workday}
          projects={projects}
          now={now}
          selectedId={selectedId}
          selectedAt={selectedAt}
          onSelect={onSelect}
          onOpenDay={onOpenDay}
        />
      </div>
    </div>
  );
}
