// A crowded day for the visual baseline (`bun run visual`), apart from the fictional week the docs
// show: more blocks than fit, overlaps, extremes of length, work across midnight, more projects than
// there are project colours, long titles in both languages, and summaries in every state.
import type { Database } from "bun:sqlite";
import {
  DEMO_OFFSET,
  type DemoSection,
  type SessionLog,
  seedSessionSummaries,
  sid,
  writeSessionLog,
} from "./demo.ts";

/** The stress day, `YYYY-MM-DD`: in August, so neither the demo week nor its month view shows it. */
export const STRESS_DAY = "2026-08-19";
const DAY = STRESS_DAY.slice(5);

/** Twelve projects: the calendar's eight project colours have to repeat. */
const PROJECTS = [
  "aurora",
  "basalt",
  "cobalt",
  "delta-api",
  "ember",
  "fjord",
  "granite",
  "heliograph-observability-platform",
  "iris",
  "juniper",
  "kestrel",
  "lumen",
].map((name) => `/Users/me/dev/${name}`);

/**
 * The first prompts of the sections whose summaries the capture asks for, which the stand-in
 * `claude` (see `stubClaude`) answers by failing, or by never finishing.
 */
export const SUMMARY_FAILS = "Rotate the signing keys for the webhook endpoints";
/** See `SUMMARY_FAILS`. */
export const SUMMARY_HANGS = "Profile the cold start of the worker pool";

/** The session whose drawer shows a summary in each state other than written, one per section. */
export const STATES_SESSION = sid(300);

/** A summary's states other than written, as the drawer shows them. */
export type SummaryState = "failed" | "pending" | "missing";

/** `STATES_SESSION`'s sections in order, by the state each shows. */
export const STATE_ORDER: readonly SummaryState[] = ["failed", "pending", "missing"];

/** A section with enough prompts to be summarized, and a headline-only summary unless `extra` says otherwise. */
function block(
  start: string,
  minutes: number,
  headline: string,
  extra: Partial<DemoSection> = {},
): DemoSection {
  return {
    day: DAY,
    start,
    minutes,
    prompts: [headline, "Run the tests and fix what fails"],
    headline,
    ...extra,
  };
}

/** Headlines for the short blocks, some in Japanese. */
const SHORT_HEADLINES = [
  "Bump the lockfile",
  "Rename the config flag",
  "ログ出力のレベルを整理",
  "Fix the date picker in Safari",
  "Cache the font files",
  "Tighten the CSP",
];

/** A section per summary state, each left unsummarized for the capture to put in that state. */
const STATE_SECTIONS: Record<SummaryState, DemoSection> = {
  failed: block("06:30", 40, SUMMARY_FAILS, { unsummarized: true }),
  pending: block("07:30", 40, SUMMARY_HANGS, { unsummarized: true }),
  missing: block("08:30", 30, "Trim the worker image", { unsummarized: true }),
};

/** One session per entry, all on the stress day; `project` indexes `PROJECTS`. */
const SESSIONS: (Omit<SessionLog, "cwd" | "branch"> & { project: number })[] = [
  {
    id: STATES_SESSION,
    project: 11,
    title: "Webhook signing and worker cold starts",
    sections: STATE_ORDER.map((state) => STATE_SECTIONS[state]),
  },
  {
    id: sid(301),
    project: 0,
    title:
      "Migrate the entire billing pipeline from the legacy cron jobs to event-driven workers with retries and dead-letter queues",
    sections: [
      {
        ...block(
          "09:00",
          480,
          "Migrated the entire billing pipeline from the legacy cron jobs to event-driven workers with retries, dead-letter queues and a replay tool for failed invoices",
        ),
        prompts: [
          "Move billing off the cron jobs onto event-driven workers",
          "Add retries with backoff",
          "Failed events go to a dead-letter queue",
          "Write a replay tool for the dead letters",
          "Backfill last month's invoices through the new path",
          "Compare totals with the old pipeline",
          "Remove the cron jobs",
          "Open a PR",
        ],
        commits: ["feat: event-driven billing workers", "feat: dead-letter replay tool"],
        pr: { number: 512, title: "Event-driven billing pipeline" },
        summary: {
          goal: "Replace the billing cron jobs with event-driven workers",
          done: [
            "Workers consume invoice events with retries and exponential backoff",
            "Events that fail five times land in a dead-letter queue, with a replay tool",
            "Backfilled August through the new path; totals match the old pipeline to the cent",
          ],
          open: ["[waiting] Review on PR #512", "[issue] The replay tool has no dry-run mode"],
        },
      },
    ],
  },
  // Four blocks over each other (five with the long one), from 10:00 to 11:40
  {
    id: sid(302),
    project: 1,
    title: "Search facets",
    sections: [block("10:00", 90, "Search facets for the catalogue")],
  },
  {
    id: sid(303),
    project: 2,
    title: "Retry budget",
    sections: [block("10:10", 50, "Retry budget for outbound calls")],
  },
  {
    id: sid(304),
    project: 3,
    title: "API v2 の認可まわり",
    sections: [
      block(
        "10:20",
        80,
        "API v2 のスコープ付きトークンと、既存クライアント向けの互換レイヤーを実装した",
      ),
    ],
  },
  {
    id: sid(305),
    project: 4,
    title: "Flaky e2e",
    sections: [block("10:30", 40, "Flaky checkout e2e test")],
  },
  {
    id: sid(306),
    project: 5,
    title: "Typo",
    sections: [
      {
        day: DAY,
        start: "12:00",
        minutes: 1,
        prompts: ["Fix the typo in the README"],
        headline: "Fix the typo in the README",
      },
    ],
  },
  {
    id: sid(307),
    project: 6,
    title: "夜間バッチの集計ロジックを全面的に見直して、タイムゾーン境界をまたぐ集計漏れを修正する",
    sections: [
      {
        ...block(
          "23:10",
          150,
          "夜間バッチの集計ロジックを全面的に見直し、タイムゾーン境界をまたぐ注文が翌日分に二重計上される不具合を修正した",
        ),
        summary: {
          goal: "日付の境界をまたぐ注文の集計漏れと二重計上をなくす",
          done: [
            "集計の締めを UTC ではなく店舗のタイムゾーンで切るように変更した",
            "境界の前後 1 時間の注文でテストを追加した",
          ],
          next: "本番の 8 月分を再集計して差分を確認する",
        },
      },
    ],
  },
  {
    id: sid(308),
    project: 7,
    title: "Trace sampling",
    sections: [block("13:00", 35, "Tail-based trace sampling for the ingestion service")],
  },
  // Short blocks through the afternoon and evening, beside the long one
  ...[
    "13:45",
    "14:30",
    "15:15",
    "16:00",
    "16:45",
    "17:30",
    "18:15",
    "19:00",
    "19:45",
    "20:30",
    "21:15",
    "22:00",
  ].map((start, i) => ({
    id: sid(310 + i),
    project: 8 + (i % 4),
    title: `Small fix ${i + 1}`,
    sections: [block(start, 30, SHORT_HEADLINES[i % SHORT_HEADLINES.length] as string)],
  })),
];

/** The stress day's sessions as logs, in `PROJECTS`' directories. */
function stressLogs(): SessionLog[] {
  return SESSIONS.map(({ project, ...session }) => ({
    ...session,
    cwd: PROJECTS[project] as string,
    branch: "main",
  }));
}

/** Writes the stress day's logs under `<claudeDir>/projects`. */
export function writeStressLogs(claudeDir: string): void {
  for (const session of stressLogs()) writeSessionLog(claudeDir, session);
}

/** Stores the stress day's summaries, leaving out the sections that show a summary's other states. */
export function seedStressSummaries(db: Database): void {
  const createdAt = Date.parse(`${STRESS_DAY}T23:59:00${DEMO_OFFSET}`);
  for (const session of stressLogs()) seedSessionSummaries(db, session, createdAt);
}

/**
 * A stand-in for `claude -p`, so the capture can show a failed summary and one in progress without
 * running the real one: it fails for `SUMMARY_FAILS` and waits for `SUMMARY_HANGS` until the server
 * that started it exits. Anything else is an error, so a capture never summarizes for real.
 */
export function stubClaude(): string {
  // The hang is checked first: a section's prompt may quote earlier sections, never later ones
  return `#!/bin/sh
input=$(cat)
case "$input" in
  *"${SUMMARY_HANGS}"*) while kill -0 $PPID 2>/dev/null; do /bin/sleep 1; done; exit 1 ;;
  *"${SUMMARY_FAILS}"*) echo "API Error: 529 Overloaded" >&2; exit 1 ;;
esac
echo "the capture's claude stand-in got an unexpected prompt" >&2
exit 1
`;
}
