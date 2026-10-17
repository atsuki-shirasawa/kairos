// Which sessions the home page's Pick up shows, and in what order: fresh ones, ranked by what they
// left open, a few per project, so the list never fills with every leftover of the week.
import type { PickUpSession, Project } from "@shared/api.ts";
import { PICK_UP_IDLE_DAYS } from "@shared/constants.ts";
import { DAY, HOUR } from "@shared/dates.ts";
import { isProjectShown } from "@shared/projects.ts";
import type { OpenKind } from "@shared/summaryBody.ts";

/** At most this many cards; the rest wait behind "n more". */
export const PICK_UP_MAX = 5;
/** At most this many cards of one project, so one busy project doesn't take the whole list. */
export const PICK_UP_PER_PROJECT = 2;
/** A session active this recently is shown, whatever its project does. */
const ACTIVE_MS = 48 * HOUR;
/** An older session is still shown while its project has moved this recently. */
const PROJECT_MOVED_MS = 3 * DAY;
/** A session leaves Pick up after this long idle (the server's window too). */
const IDLE_MS = PICK_UP_IDLE_DAYS * DAY;
/** A session's weight halves every this long since its latest summarized block ended. */
const HALF_LIFE_MS = 3 * DAY;

/**
 * What a session left, by how much it asks of you: something blocked on you first, then the step
 * it was about to take, then unfinished work, problems found, and open questions last.
 */
export const KIND_WEIGHT: Record<OpenKind | "next", number> = {
  waiting: 5,
  next: 4,
  todo: 3,
  issue: 2,
  question: 1,
};
/** An item the model left untagged weighs as little as a question: nothing says it is more. */
const UNTAGGED_WEIGHT = KIND_WEIGHT.question;
/** An item naming an issue, PR or task is easier to act on: a small bonus over its kind. */
const REF_BONUS = 0.5;

/** The sessions Pick up shows, and the ones its caps leave behind "n more", each in rank order. */
export interface PickUpList {
  shown: PickUpSession[];
  more: PickUpSession[];
}

/**
 * Whether a session belongs in Pick up at `now`: idle less than `IDLE_MS`, and active within
 * `ACTIVE_MS` or in a project that moved within `PROJECT_MOVED_MS`.
 */
export function isPickUpCandidate(s: PickUpSession, now: number): boolean {
  const idle = now - s.lastActive;
  if (idle >= IDLE_MS) return false;
  if (idle <= ACTIVE_MS) return true;
  return s.projectMovedAt !== null && now - s.projectMovedAt <= PROJECT_MOVED_MS;
}

/** How much the session's heaviest leftover weighs (its next step counts as one). */
function heaviestWeight(s: PickUpSession): number {
  const weights = s.items.map((i) => (i.kind ? KIND_WEIGHT[i.kind] : UNTAGGED_WEIGHT));
  if (s.next) weights.push(KIND_WEIGHT.next);
  return Math.max(0, ...weights);
}

/**
 * A session's rank at `now`: its heaviest leftover, `REF_BONUS` when an item names a ref, halved
 * every `HALF_LIFE_MS` since its latest summarized block ended.
 */
export function pickUpScore(s: PickUpSession, now: number): number {
  const bonus = s.items.some((i) => i.refs.length > 0) ? REF_BONUS : 0;
  const freshness = 0.5 ** (Math.max(0, now - s.end) / HALF_LIFE_MS);
  return (heaviestWeight(s) + bonus) * freshness;
}

/**
 * Pick up at `now`: the candidates of shown projects, minus the sessions running (Now lists them),
 * ranked; at most `PICK_UP_MAX` shown and `PICK_UP_PER_PROJECT` of a project, the rest in `more`.
 */
export function pickUp(
  sessions: readonly PickUpSession[],
  now: number,
  { projects, running }: { projects: ReadonlyMap<number, Project>; running: ReadonlySet<string> },
): PickUpList {
  const ranked = sessions
    .filter((s) => isPickUpCandidate(s, now) && !running.has(s.sessionId))
    .filter((s) => isProjectShown(projects, s.projectId))
    .map((s) => ({ s, score: pickUpScore(s, now) }))
    .sort((a, b) => b.score - a.score || b.s.end - a.s.end)
    .map(({ s }) => s);
  return capped(ranked);
}

/** Ranked sessions split by the caps, keeping the rank order on both sides. */
function capped(ranked: PickUpSession[]): PickUpList {
  const perProject = new Map<number | null, number>();
  const list: PickUpList = { shown: [], more: [] };
  for (const s of ranked) {
    const count = perProject.get(s.projectId) ?? 0;
    const fits = list.shown.length < PICK_UP_MAX && count < PICK_UP_PER_PROJECT;
    if (fits) perProject.set(s.projectId, count + 1);
    (fits ? list.shown : list.more).push(s);
  }
  return list;
}

/** How many of the session's items wait on you. */
export function waitingCount(s: PickUpSession): number {
  return s.items.filter((i) => i.kind === "waiting").length;
}
