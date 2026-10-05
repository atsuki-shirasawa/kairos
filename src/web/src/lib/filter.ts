// 期間の作業の絞り込み。プロジェクトの非表示（DB に保存する、ずっと見たくないもの）とは別に、
// URL に持たせる「今だけ絞る」条件を扱う。
import type { CalendarSegment, CalendarSession, Project } from "@shared/api.ts";

export interface Filter {
  /** 見出し・タイトル・worktree 名・プロジェクト名の部分一致。空白で区切った語をすべて含むもの。 */
  q: string;
  /** コミットか PR のある作業だけにする。 */
  outcome: boolean;
  /** ちょっとした質問（`isBrief`）のセッションを隠す。 */
  hideBrief: boolean;
}

export const NO_FILTER: Filter = { q: "", outcome: false, hideBrief: false };

/** これ以下の発言で、手を動かしていないセッションを「ちょっとした質問」とみなす。 */
export const BRIEF_PROMPTS = 2;

/** 一時的な絞り込み（キーワード・成果）が効いているか。隠す条件は含めない。 */
export const isFocused = (f: Filter) => f.q.trim() !== "" || f.outcome;

export const isFiltered = (f: Filter) => isFocused(f) || f.hideBrief;

/**
 * 発言が少なく、ファイルの書き換え・コミット・PR がないセッション。
 * 1 回の依頼で大きな作業を任せたものは、書き換えがあるので残る。
 */
export function isBrief(session: CalendarSession): boolean {
  if (session.promptCount > BRIEF_PROMPTS) return false;
  return session.segments.every(
    (g) => g.activity.filesEdited === 0 && g.activity.commits === 0 && g.activity.prs === 0,
  );
}

/** 画面から外すセッションを除く（非表示のプロジェクトと、隠すと決めたちょっとした質問）。 */
export function hideSessions(
  sessions: CalendarSession[],
  projects: Map<number, Project>,
  filter: Filter,
): CalendarSession[] {
  return sessions.filter(
    (s) =>
      (s.projectId === null || !projects.get(s.projectId)?.hidden) &&
      !(filter.hideBrief && isBrief(s)),
  );
}

export type SegmentMatch = (session: CalendarSession, segment: CalendarSegment) => boolean;

/** キーワードと成果の条件に合う作業ブロックか。条件がなければすべて合う。 */
export function segmentMatcher(filter: Filter, projects: Map<number, Project>): SegmentMatch {
  const terms = filter.q.toLowerCase().split(/\s+/).filter(Boolean);
  return (session, segment) => {
    if (filter.outcome && segment.activity.commits + segment.activity.prs === 0) return false;
    if (terms.length === 0) return true;
    const project = session.projectId !== null ? projects.get(session.projectId) : undefined;
    const text = [segment.headline, session.title, session.label, project?.name]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return terms.every((t) => text.includes(t));
  };
}

/** 条件に合う作業ブロックだけを残す。合うものが 1 つもないセッションは除く。 */
export function narrowSessions(
  sessions: CalendarSession[],
  match: SegmentMatch,
): CalendarSession[] {
  return sessions.flatMap((s) => {
    const segments = s.segments.filter((g) => match(s, g));
    if (segments.length === 0) return [];
    return segments.length === s.segments.length ? [s] : [{ ...s, segments }];
  });
}
