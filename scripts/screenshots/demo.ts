// A fictional week of Claude Code work for the screenshots in docs/images/: four projects, sections
// of realistic length (some running in parallel), commits and PRs, and the summaries and recaps the
// summarizer would have written. Nothing here comes from real logs.
import type { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { recordSection } from "../../src/server/summarize/ledger/record.ts";
import { loadRecapInput } from "../../src/server/summarize/recap.ts";
import { saveRecap, saveSummary } from "../../src/server/summarize/store.ts";
import { parseSummaryBody } from "../../src/shared/summaryBody.ts";
import { at, LogBuilder, type Rec, type TokenUsage } from "../../tests/fixtures/builder.ts";

/** Time zone the demo week is laid out in; the capture renders in the same zone. */
export const DEMO_TZ = "Asia/Tokyo";
/** `DEMO_TZ`'s offset, for writing the demo's local times as instants. */
export const DEMO_OFFSET = "+09:00";

/**
 * Sunday of the demo week, `YYYY-MM-DD`. Weeks start on Sunday in the app, and recaps are keyed by
 * that period, so the seeded ones must start here to be found.
 */
export const DEMO_WEEK = "2026-09-27";
/** The day for the day-view screenshot: a long block there shows its summary body. */
export const DEMO_DAY = "2026-09-30";
/**
 * The time the capture's server and browser are frozen at, so relative times and the live page read
 * the same on every run. After the demo week and the month view's days around it (September 2026),
 * so the sessions running then stay out of the calendar shots.
 */
export const DEMO_NOW = Date.parse(`2026-10-14T15:00:00${DEMO_OFFSET}`);

const PROJECTS = {
  atlas: "/Users/me/dev/atlas",
  harbor: "/Users/me/dev/harbor",
  "field-notes": "/Users/me/dev/field-notes",
  infra: "/Users/me/dev/infra",
} as const;

type ProjectKey = keyof typeof PROJECTS;

/** One work block of a demo session, written as a section of its log. */
export interface DemoSection {
  /** `MM-DD` in 2026. */
  day: string;
  /** Local start time, `HH:MM`. */
  start: string;
  minutes: number;
  /** The first starts the section; the rest are spread across it. */
  prompts: string[];
  files?: string[];
  commits?: string[];
  pr?: { number: number; title: string };
  /** A failing test run partway through, counted as a snag. */
  snag?: boolean;
  headline: string;
  /** No summary at all, not even the headline: one still to write, or one the capture asks for. */
  unsummarized?: boolean;
  /** Left out for a short section, which gets only a headline. */
  summary?: {
    goal: string;
    done: string[];
    resolved?: string[];
    /** Each with its "[kind]" tag, as the summarizer writes it. */
    open?: string[];
    next?: string;
  };
}

interface DemoSession {
  id: string;
  project: ProjectKey;
  branch: string;
  title: string;
  sections: DemoSection[];
}

/** A demo session ID, numbered so each group of sessions can keep its own range. */
export const sid = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** The session opened in the drawer for the week screenshot. */
export const DRAWER_SESSION = sid(9);

/**
 * Work earlier on the capture's day that left things open, for the home page's Pick up: three in
 * atlas, so its per-project cap leaves one behind "n more". On the capture's day, so the last
 * workday and the calendar shots stay on the demo week.
 */
function pickUpSessions(): DemoSession[] {
  const session = (
    n: number,
    project: ProjectKey,
    title: string,
    section: Omit<DemoSection, "day" | "headline">,
  ): DemoSession => ({
    id: sid(n),
    project,
    branch: "main",
    title,
    sections: [{ day: "10-14", headline: title, ...section }],
  });
  return [
    session(18, "atlas", "Snippets in search results", {
      start: "09:10",
      minutes: 70,
      prompts: ["Show a snippet of the matching text under each search result", "Open a PR"],
      files: ["src/search/snippet.ts", "src/search/query.ts"],
      pr: { number: 226, title: "Search result snippets" },
      summary: {
        goal: "Show where each search result matched",
        done: ["Built snippets from the FTS5 index's offsets", "Opened PR #226"],
        open: [
          "[waiting] Review on PR #226",
          "[todo] Trim snippets at word boundaries in Japanese",
        ],
        next: "Address the review comments on #226",
      },
    }),
    session(19, "harbor", "Charts in dark mode", {
      start: "10:30",
      minutes: 45,
      prompts: ["The usage charts are unreadable in dark mode"],
      files: ["src/charts/theme.ts"],
      summary: {
        goal: "Make the usage charts readable in dark mode",
        done: ["Moved the chart colors to theme tokens"],
        open: [
          "[question] Whether the charts should follow the system theme or the app's",
          "[todo] Check the contrast of the stacked bars",
        ],
        next: "Check the stacked bars' contrast against the dark surface",
      },
    }),
    session(20, "atlas", "Flaky export test", {
      start: "11:30",
      minutes: 35,
      prompts: ["The CSV export test fails now and then in CI"],
      files: ["tests/export.test.ts"],
      summary: {
        goal: "Find why the export test is flaky",
        done: ["Reproduced it once in 40 runs with a slow disk"],
        open: ["[issue] The export test depends on file write timing (#230)"],
      },
    }),
    session(21, "infra", "Backup restore drill", {
      start: "12:40",
      minutes: 40,
      prompts: ["Walk through restoring last night's backup to a scratch database"],
      summary: {
        goal: "Check that last night's backup restores",
        done: ["Restored it to a scratch database in 11 minutes"],
        open: ["[waiting] Ops to pick a window for the production drill"],
      },
    }),
    session(22, "atlas", "Rate limit docs", {
      start: "13:30",
      minutes: 25,
      prompts: ["Document the rate limits in the API reference"],
      files: ["docs/api/rate-limits.md"],
      summary: {
        goal: "Document the public API's rate limits",
        done: ["Wrote the limits and the 429 response"],
        open: ["[todo] Document the Retry-After header"],
      },
    }),
  ];
}

const SESSIONS: DemoSession[] = [
  {
    id: sid(1),
    project: "atlas",
    branch: "feature/rate-limit",
    title: "Rate limiting for the public API",
    sections: [
      {
        day: "09-28",
        start: "09:30",
        minutes: 95,
        prompts: [
          "Add rate limiting to the public API. Per API key, 100 requests a minute, with a Retry-After header",
          "Use a sliding window instead of fixed buckets",
          "Open a PR",
        ],
        files: ["src/middleware/rateLimit.ts", "src/middleware/rateLimit.test.ts", "src/app.ts"],
        commits: ["feat: rate-limit the public API per key", "test: cover the sliding window"],
        pr: { number: 214, title: "Rate-limit the public API per key" },
        headline: "Per-key rate limiting for the public API (#214)",
        summary: {
          goal: "Protect the public API from bursts by limiting each API key",
          done: [
            "Added a sliding-window limiter middleware (100 requests a minute per key) with a `Retry-After` header",
            "Replaced the first fixed-bucket version after it let double bursts through at window edges",
            "Covered window edges and key isolation in tests",
          ],
          open: ["[waiting] Review on PR #214"],
        },
      },
      {
        day: "09-28",
        start: "14:00",
        minutes: 40,
        prompts: ["Address the review comments on #214", "Also log when a key gets limited"],
        files: ["src/middleware/rateLimit.ts", "src/log.ts"],
        commits: ["fix: count requests after auth, log limited keys"],
        headline: "Review fixes on #214: count after auth, log limited keys",
        summary: {
          goal: "Resolve the review on the rate-limit PR",
          done: [
            "Moved counting after authentication so rejected keys don't use up a budget",
            "Logged limited keys at info level for the dashboard",
          ],
          resolved: ["Review on #214: fixes pushed and approved"],
        },
      },
    ],
  },
  {
    id: sid(2),
    project: "harbor",
    branch: "main",
    title: "Dashboard chart flicker",
    sections: [
      {
        day: "09-28",
        start: "11:15",
        minutes: 45,
        prompts: [
          "The usage chart on the dashboard flickers when the window resizes. Find out why",
        ],
        files: ["src/dashboard/UsageChart.tsx", "src/hooks/useSize.ts"],
        commits: ["fix: debounce chart resizes"],
        snag: true,
        headline: "Usage chart flicker on resize in the dashboard",
        summary: {
          goal: "Stop the dashboard usage chart from flickering while resizing",
          done: [
            "Traced it to `useSize` re-rendering the chart on every resize event",
            "Debounced size updates and kept the previous frame until the new one is ready",
          ],
          resolved: ["Flicker on resize: fixed and committed, tests pass"],
          open: ["[issue] The chart's snapshot test is flaky; updated, not fixed"],
        },
      },
    ],
  },
  {
    id: sid(3),
    project: "field-notes",
    branch: "main",
    title: "Post: SQLite WAL in practice",
    sections: [
      {
        day: "09-28",
        start: "16:30",
        minutes: 55,
        prompts: [
          "Help me draft a post on running SQLite in WAL mode for a local app",
          "Tighten the intro and add a section on checkpoints",
        ],
        files: ["posts/sqlite-wal.md"],
        headline: "Draft of the SQLite WAL post",
        summary: {
          goal: "Write a first draft of a post on SQLite's WAL mode",
          done: [
            "Outlined readers vs. writers, checkpoints and the `-wal` / `-shm` files",
            "Rewrote the intro and added a checkpoint section with a small benchmark",
          ],
          next: "Read the draft through before publishing",
        },
      },
    ],
  },
  {
    id: sid(4),
    project: "harbor",
    branch: "feature/billing-page",
    title: "Billing settings page",
    sections: [
      {
        day: "09-29",
        start: "09:00",
        minutes: 120,
        prompts: [
          "Build the billing settings page: current plan, payment method, invoices",
          "Invoices should be a paginated table",
          "Add empty and error states",
        ],
        files: [
          "src/settings/BillingPage.tsx",
          "src/settings/InvoiceTable.tsx",
          "src/api/billing.ts",
          "src/settings/BillingPage.test.tsx",
        ],
        commits: ["feat: billing settings page", "feat: paginated invoice table"],
        headline: "Billing settings page with plan, payment method and invoices",
        summary: {
          goal: "Give customers one place to see their plan, payment method and invoices",
          done: [
            "Built the page and a paginated invoice table on the billing API",
            "Added empty and error states, with tests for each",
          ],
          open: ["[todo] Make the page work on small screens, then open the PR"],
        },
      },
      {
        day: "09-29",
        start: "13:30",
        minutes: 70,
        prompts: ["Make the invoice table work on mobile", "Open a PR"],
        files: ["src/settings/InvoiceTable.tsx", "src/settings/billing.css"],
        commits: ["feat: stack invoice rows on small screens"],
        pr: { number: 88, title: "Billing settings page" },
        headline: "Mobile invoice table and PR #88 for the billing page",
        summary: {
          goal: "Finish the billing page for small screens and get it reviewed",
          done: [
            "Stacked invoice rows into cards under 640px",
            "Opened PR #88 with screenshots of each state",
          ],
          open: ["[waiting] Review on PR #88"],
        },
      },
    ],
  },
  {
    id: sid(5),
    project: "atlas",
    branch: "main",
    title: "Slow /search",
    sections: [
      {
        day: "09-29",
        start: "10:30",
        minutes: 35,
        prompts: ["Why is /search slow for accounts with lots of documents?"],
        headline: "Why /search is slow for large accounts",
        summary: {
          goal: "Find the cause of slow searches on large accounts",
          done: [
            "Profiled the query: a full scan over `documents` with `LIKE` on every request",
            "Sketched a search index as the fix",
          ],
          resolved: ["Cause: a full scan over `documents` with `LIKE` on every request"],
          next: "Add a search index on Wednesday",
        },
      },
    ],
  },
  {
    id: sid(6),
    project: "infra",
    branch: "ci/bun",
    title: "Move CI to Bun",
    sections: [
      {
        day: "09-29",
        start: "15:30",
        minutes: 50,
        prompts: ["Switch the CI workflows from npm to bun", "Cache the bun install"],
        files: [".github/workflows/ci.yml", ".github/workflows/release.yml"],
        commits: ["ci: run on bun with a cached install"],
        pr: { number: 12, title: "Run CI on Bun" },
        headline: "CI workflows on Bun with a cached install (#12)",
        summary: {
          goal: "Speed up CI by running it on Bun",
          done: [
            "Replaced npm steps in both workflows and cached the install",
            "CI time went from about 6 minutes to under 2",
          ],
          resolved: ["CI on Bun: under 2 minutes, PR #12 opened"],
        },
      },
    ],
  },
  {
    id: sid(7),
    project: "atlas",
    branch: "fix/token-refresh",
    title: "Token refresh race",
    sections: [
      {
        day: "09-30",
        start: "09:45",
        minutes: 60,
        prompts: [
          "Two tabs refreshing the token at once log the user out. Fix the race",
          "Add a regression test",
        ],
        files: ["src/auth/refresh.ts", "src/auth/refresh.test.ts"],
        commits: ["fix: share one in-flight token refresh"],
        pr: { number: 219, title: "Share one in-flight token refresh" },
        snag: true,
        headline: "Token refresh race logging users out (#219)",
        summary: {
          goal: "Stop concurrent token refreshes from invalidating each other",
          done: [
            "Made refreshes share a single in-flight request",
            "Added a regression test with two simultaneous refreshes",
          ],
          resolved: ["Token refresh race: fixed in PR #219, regression test passes"],
        },
      },
    ],
  },
  {
    id: sid(8),
    project: "harbor",
    branch: "main",
    title: "Storybook build",
    sections: [
      {
        day: "09-30",
        start: "11:00",
        minutes: 25,
        prompts: ["Storybook doesn't build since the Vite upgrade"],
        files: [".storybook/main.ts"],
        commits: ["fix: storybook config for vite 8"],
        headline: "Storybook build after the Vite 8 upgrade",
        summary: {
          goal: "Get Storybook building again",
          done: ["Moved the config to the new builder options for Vite 8"],
          resolved: ["Storybook builds again on Vite 8; committed"],
        },
      },
    ],
  },
  {
    id: sid(9),
    project: "atlas",
    branch: "feature/search-index",
    title: "Search index",
    sections: [
      {
        day: "09-30",
        start: "13:00",
        minutes: 150,
        prompts: [
          "Add a full-text search index for /search, based on what we found yesterday",
          "Keep the index in sync on update and delete",
          "Benchmark it against the old query",
        ],
        files: [
          "src/search/index.ts",
          "src/search/sync.ts",
          "src/db/migrations/014_search_index.sql",
          "src/routes/search.ts",
          "bench/search.ts",
        ],
        commits: [
          "feat: full-text index for documents",
          "feat: keep the search index in sync",
          "perf: query /search through the index",
        ],
        headline: "Full-text search index for /search",
        summary: {
          goal: "Make /search fast for accounts with many documents",
          done: [
            "Added an FTS5 index over documents with a migration and backfill",
            "Kept it in sync on update and delete with triggers",
            "Routed /search through the index; p95 went from 1.8 s to 40 ms on the largest account",
          ],
          resolved: [
            "Search speed: index and sync in three commits on `feature/search-index`, tests pass",
          ],
          open: [
            "[question] Whether the migration and backfill are safe to run in production",
            "[waiting] A review of the migration before the PR",
          ],
          next: "Have the migration reviewed, then open the PR",
        },
      },
      {
        day: "10-01",
        start: "09:30",
        minutes: 80,
        prompts: ["Review the migration for locking issues, then open the PR"],
        files: ["src/db/migrations/014_search_index.sql", "docs/search.md"],
        commits: ["fix: backfill the index in batches"],
        pr: { number: 221, title: "Full-text search index for /search" },
        headline: "Batched index backfill and PR #221 for search",
        summary: {
          goal: "Make the search migration safe to run in production",
          done: [
            "Found the backfill would hold a write lock for minutes; split it into batches of 5,000",
            "Documented the index and opened PR #221",
          ],
          resolved: ["Backfill no longer holds a long write lock: batches of 5,000"],
          open: ["[waiting] Review on PR #221"],
        },
      },
    ],
  },
  {
    id: sid(10),
    project: "field-notes",
    branch: "main",
    title: "Publish the WAL post",
    sections: [
      {
        day: "09-30",
        start: "17:00",
        minutes: 35,
        prompts: ["Proofread the WAL post and publish it"],
        files: ["posts/sqlite-wal.md"],
        commits: ["post: SQLite WAL in practice"],
        headline: "Proofread and published the SQLite WAL post",
        summary: {
          goal: "Publish the SQLite WAL post",
          done: ["Fixed wording and a wrong pragma name; added a summary box"],
          resolved: ["Post published"],
        },
      },
    ],
  },
  {
    id: sid(11),
    project: "harbor",
    branch: "feature/onboarding",
    title: "Onboarding checklist",
    sections: [
      {
        day: "10-01",
        start: "10:00",
        minutes: 105,
        prompts: [
          "Add an onboarding checklist to the home screen for new workspaces",
          "Steps should tick off by themselves when done",
        ],
        files: [
          "src/home/Onboarding.tsx",
          "src/home/useOnboarding.ts",
          "src/api/onboarding.ts",
          "src/home/Onboarding.test.tsx",
        ],
        commits: ["feat: onboarding checklist", "feat: tick steps off automatically"],
        headline: "Onboarding checklist on the home screen",
        summary: {
          goal: "Guide new workspaces through their first steps",
          done: [
            "Added a dismissible checklist (invite, connect a source, first report)",
            "Steps tick off from workspace events instead of manual clicks",
          ],
          open: ["[waiting] Review of the checklist copy"],
        },
      },
    ],
  },
  {
    id: sid(12),
    project: "infra",
    branch: "main",
    title: "Staging certificates",
    sections: [
      {
        day: "10-01",
        start: "14:30",
        minutes: 60,
        prompts: ["The staging certificates expire next week. Rotate them and automate it"],
        files: ["terraform/staging/certs.tf", "scripts/rotate-certs.sh"],
        commits: ["infra: auto-renew staging certificates"],
        headline: "Automatic renewal for staging certificates",
        summary: {
          goal: "Rotate the expiring staging certificates for good",
          done: [
            "Moved staging to managed certificates that renew automatically",
            "Removed the manual rotation script",
          ],
          resolved: ["Staging certificates renew automatically; applied and committed"],
        },
      },
    ],
  },
  {
    id: sid(13),
    project: "harbor",
    branch: "main",
    title: "Review dark mode",
    sections: [
      {
        day: "10-01",
        start: "16:00",
        minutes: 45,
        prompts: ["Review PR #91 (dark mode) and leave comments"],
        headline: "Review of the dark mode PR #91",
        summary: {
          goal: "Review the dark mode PR",
          done: [
            "Checked contrast of every token against WCAG AA",
            "Flagged two hard-coded colors in charts",
          ],
          resolved: ["Review of #91 sent: changes requested for two hard-coded chart colors"],
        },
      },
    ],
  },
  {
    id: sid(14),
    project: "atlas",
    branch: "release/2.4",
    title: "Release 2.4",
    sections: [
      {
        day: "10-02",
        start: "10:00",
        minutes: 70,
        prompts: ["Write the 2.4 release notes and changelog from the merged PRs"],
        files: ["CHANGELOG.md", "docs/releases/2.4.md"],
        commits: ["docs: release notes for 2.4"],
        headline: "Release notes and changelog for atlas 2.4",
        summary: {
          goal: "Prepare the 2.4 release",
          done: [
            "Grouped this week's PRs (#214, #219, #221) into features and fixes",
            "Wrote upgrade notes for the search migration",
          ],
          resolved: ["Release notes for 2.4 committed"],
          next: "Tag 2.4 on Monday",
        },
      },
    ],
  },
  {
    id: sid(15),
    project: "harbor",
    branch: "feature/onboarding",
    title: "Onboarding checklist",
    sections: [
      {
        day: "10-02",
        start: "11:30",
        minutes: 90,
        prompts: ["Apply the copy review to the onboarding checklist", "Open a PR"],
        files: ["src/home/Onboarding.tsx", "src/i18n/en.json"],
        commits: ["copy: onboarding checklist wording"],
        pr: { number: 93, title: "Onboarding checklist" },
        headline: "Onboarding copy review and PR #93",
        summary: {
          goal: "Finish the onboarding checklist",
          done: ["Applied the copy review", "Opened PR #93"],
          open: ["[waiting] Review on PR #93"],
        },
      },
    ],
  },
  {
    id: sid(16),
    project: "field-notes",
    branch: "main",
    title: "Next post outline",
    sections: [
      {
        day: "10-02",
        start: "15:00",
        minutes: 40,
        prompts: ["Outline a post about the search index work"],
        files: ["posts/drafts/search-index.md"],
        headline: "Outline for a post on the search index",
        summary: {
          goal: "Plan the next post",
          done: ["Outlined the problem, FTS5, the batched backfill and the numbers"],
          next: "Write the post from the outline",
        },
      },
    ],
  },
  {
    id: sid(17),
    project: "harbor",
    branch: "main",
    title: "Quick question",
    sections: [
      {
        day: "10-02",
        start: "16:40",
        minutes: 4,
        prompts: ["What's the flag to run only changed tests in vitest?"],
        headline: "Running only changed tests in vitest",
      },
    ],
  },
  ...pickUpSessions(),
];

/** A lighter previous week, so the summary view has something to compare against. */
const PREVIOUS_WEEK: DemoSession[] = [
  ["09-21", "10:00", 110, "atlas", "API key management endpoints"],
  ["09-21", "14:30", 60, "harbor", "Settings navigation"],
  ["09-22", "09:30", 140, "harbor", "Workspace switcher"],
  ["09-23", "11:00", 90, "atlas", "Audit log export"],
  ["09-23", "15:00", 45, "infra", "Staging database upgrade"],
  ["09-24", "10:00", 120, "atlas", "Pagination for the documents API"],
  ["09-25", "13:00", 75, "field-notes", "Notes on Bun's SQLite driver"],
].map(([day, start, minutes, project, headline], i) => ({
  id: sid(100 + i),
  project: project as ProjectKey,
  branch: "main",
  title: String(headline),
  sections: [
    {
      day: String(day),
      start: String(start),
      minutes: Number(minutes),
      prompts: [String(headline)],
      commits: [`feat: ${String(headline).toLowerCase()}`],
      headline: String(headline),
    },
  ],
}));

/** Recaps per project for the demo week, as the summary view's button would write them. */
const RECAPS: Record<ProjectKey, string> = {
  atlas: `A week on API robustness and search performance, ending with the 2.4 release notes.

- Added per-key rate limiting to the public API (#214)
- Fixed a token refresh race that logged users out of concurrent tabs (#219)
- Replaced the full-scan search with an FTS5 index, cutting p95 from 1.8 s to 40 ms, with a batched backfill (#221)
- Wrote the 2.4 release notes and changelog`,
  harbor: `Customer-facing settings and onboarding, plus a few fixes.

- Built the billing settings page with a paginated, mobile-friendly invoice table (#88)
- Added an onboarding checklist that ticks itself off (#93)
- Fixed the dashboard chart flicker and the Storybook build after the Vite 8 upgrade
- Open: dark mode (#91) needs changes before it can merge`,
  "field-notes": `Wrote and published a post on SQLite's WAL mode, and outlined the next one on the search index.

- Drafted, tightened and published "SQLite WAL in practice"
- Outlined a follow-up post on the atlas search index`,
  infra: `Faster CI and no more manual certificate rotation.

- Moved CI to Bun with a cached install, from about 6 minutes to under 2 (#12)
- Switched staging to automatically renewing certificates`,
};

const minuteBase = Date.parse(at(0));

/** Minutes after the fixture base time for a local `MM-DD` and `HH:MM`, as `LogBuilder` expects. */
function minuteOf(day: string, time: string): number {
  return (Date.parse(`2026-${day}T${time}:00${DEMO_OFFSET}`) - minuteBase) / 60_000;
}

let commitSeq = 0;

/** Writes one section: its prompts, tool calls every few minutes, commits, an optional PR. */
function writeSection(b: LogBuilder, s: DemoSection, cwd: string): void {
  const start = minuteOf(s.day, s.start);
  const end = start + s.minutes;
  const turn = s.minutes / s.prompts.length;
  const files = s.files ?? [];
  const commits = commitTimes(s, start);
  s.prompts.forEach((prompt, i) => {
    const from = start + i * turn;
    const to = from + turn;
    b.prompt(from, prompt);
    let step = 0;
    // Activity at least every few minutes keeps the section one block (it splits at 15 minutes)
    for (let t = from + 0.5; t < to - 1.5; t += 3.5, step++) {
      const file = files[step % Math.max(files.length, 1)];
      if (file && step % 2 === 0) {
        const id = b.toolUse(t, "Edit", {
          file_path: `${cwd}/${file}`,
          old_string: "",
          new_string: "// …",
        });
        b.toolResult(t, id, "The file has been updated.", {
          result: { filePath: `${cwd}/${file}` },
        });
      } else if (s.snag && i === 0 && step === 3) {
        b.bash(t, "bun test", "1 fail\n  expected 200, received 429", true);
      } else {
        b.bash(t, "bun test", "42 pass\n0 fail");
      }
      while (commits[0] !== undefined && commits[0].at <= t) {
        const next = commits.shift();
        if (next) writeCommit(b, next.message, t + 0.2);
      }
    }
    if (i === s.prompts.length - 1) {
      for (const [k, c] of commits.entries()) writeCommit(b, c.message, end - 3 + k * 0.3);
      writePr(b, s, cwd, end);
    }
    b.text(to, "Done.");
    b.turnEnd(to, Math.round(turn * 60_000 * 0.6));
  });
}

/**
 * When each commit of a section lands: spread through the work, the last one shortly before the
 * end. Real logs commit all along a block, not only at its end, and the calendar marks each one
 * where it happened.
 */
function commitTimes(s: DemoSection, start: number): { message: string; at: number }[] {
  const messages = s.commits ?? [];
  return messages.map((message, i) => ({
    message,
    at: start + (s.minutes * (i + 1)) / (messages.length + 0.4) - 2,
  }));
}

/** One `git commit` with its output, as Claude Code logs it. */
function writeCommit(b: LogBuilder, message: string, at: number): void {
  commitSeq += 1;
  const hash = (0x1a2b3c0 + commitSeq * 7919).toString(16).slice(0, 7);
  b.bash(
    at,
    `git commit -m "${message}"`,
    `[${b.gitBranch} ${hash}] ${message}\n 3 files changed, 64 insertions(+), 12 deletions(-)`,
  );
}

/** The section's PR, just before it ends. */
function writePr(b: LogBuilder, s: DemoSection, cwd: string, end: number): void {
  if (s.pr) {
    b.ghPrCreate(end - 1.5, `gh pr create --title "${s.pr.title}" --body "…"`, {
      number: s.pr.number,
      repository: `me/${basename(cwd)}`,
    });
  }
}

/** A session to write as a log: where it ran and its sections in order. */
export interface SessionLog {
  id: string;
  cwd: string;
  branch: string;
  title: string;
  sections: DemoSection[];
}

/** Writes one session as jsonl under `<claudeDir>/projects`, laid out like `~/.claude`. */
export function writeSessionLog(claudeDir: string, session: SessionLog): void {
  const b = new LogBuilder(session.id, session.cwd, session.branch);
  b.meta("mode", { mode: "normal" });
  for (const section of session.sections) writeSection(b, section, session.cwd);
  b.meta("ai-title", { aiTitle: session.title });
  const dir = join(claudeDir, "projects", session.cwd.replace(/[/.]/g, "-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${session.id}.jsonl`), b.toJsonl());
}

/** Writes the demo sessions as jsonl under `<claudeDir>/projects`. */
export function writeDemoLogs(claudeDir: string): void {
  for (const session of [...PREVIOUS_WEEK, ...SESSIONS])
    writeSessionLog(claudeDir, { ...session, cwd: PROJECTS[session.project] });
}

/**
 * Stores the summaries and recaps the summarizer would have written, through its own store
 * functions, so the screenshots show summarized blocks without running `claude -p`.
 * Run after ingesting the demo logs.
 */
export function seedDemoSummaries(db: Database): void {
  const createdAt = Date.parse(`2026-10-02T18:00:00${DEMO_OFFSET}`);
  for (const session of [...PREVIOUS_WEEK, ...SESSIONS])
    seedSessionSummaries(db, session, createdAt);
  seedRecaps(db, createdAt);
}

/**
 * Stores a session's summaries as the summarizer would have written them, section by section in
 * the order the log has them, and fills the open-items ledger from them. Run after ingesting it.
 */
export function seedSessionSummaries(
  db: Database,
  session: Pick<SessionLog, "id" | "sections">,
  createdAt: number,
): void {
  const segments = db
    .query<{ id: number; start: number; end: number }, [string]>(
      "SELECT id, start, end FROM segments WHERE session_id = ? ORDER BY start",
    )
    .all(session.id);
  if (segments.length !== session.sections.length) {
    throw new Error(
      `${session.id}: ${segments.length} blocks ingested, ${session.sections.length} written`,
    );
  }
  segments.forEach((seg, i) => {
    const s = session.sections[i] as DemoSection;
    if (s.unsummarized) return;
    const target = { sessionId: session.id, start: seg.start, blockId: seg.id };
    const body = s.summary ? summaryBody(s.summary) : "";
    saveSummary(
      db,
      seg.id,
      { headline: s.headline, short: null, body },
      { model: "haiku", covered: { from: seg.start, until: seg.end }, createdAt },
    );
    // The open items list reads the ledger, which the summarizer fills as it saves
    recordSection(db, target, {
      end: seg.end,
      opened: parseSummaryBody(body)?.open ?? [],
      tasks: [],
      closed: [],
    });
  });
}

/** A section summary body in the summarizer's shape, leaving out the items a section has none of. */
function summaryBody(s: NonNullable<DemoSection["summary"]>): string {
  const list = (label: string, points: string[] | undefined) =>
    points?.length ? [`- ${label}:`, ...points.map((p) => `  - ${p}`)] : [];
  return [
    `- Goal: ${s.goal}`,
    ...list("Done", s.done),
    ...list("Resolved", s.resolved),
    ...list("Open", s.open),
    ...(s.next ? [`- Next: ${s.next}`] : []),
  ].join("\n");
}

/** Recaps for the demo week, keyed by the same period the summary view asks for. */
function seedRecaps(db: Database, createdAt: number): void {
  const from = Date.parse(`${DEMO_WEEK}T00:00:00${DEMO_OFFSET}`);
  const to = from + 7 * 86_400_000;
  for (const [key, body] of Object.entries(RECAPS)) {
    const name = key;
    const project = db
      .query<{ id: number }, [string]>("SELECT id FROM projects WHERE name = ?")
      .get(name);
    if (!project) throw new Error(`project ${name} was not ingested`);
    const target = { projectId: project.id, from, to };
    const input = loadRecapInput(db, target);
    if (!input) throw new Error(`no work for ${name} in the demo week`);
    saveRecap(db, target, input, body, { model: "haiku", createdAt });
  }
}

/** What Claude Code's session registry says of a running session, minus the process's PID. */
export interface LiveDemoEntry {
  sessionId: string;
  cwd: string;
  kind: "interactive" | "bg";
  status: "busy" | "idle";
  statusUpdatedAt: number;
  startedAt: number;
  name: string;
  /** Not part of the registry entry: whether the live page shows it under On you. */
  onYou: boolean;
}

/**
 * A session running at capture time, for the live page. Its log is laid out backwards from `now`,
 * so the page's durations read as they would on the day; `write` adds what the log ends with (the
 * call in flight, the question, tasks, the last test).
 */
interface LiveDemo {
  id: string;
  project: ProjectKey;
  branch: string;
  title: string;
  kind: "interactive" | "bg";
  status: "busy" | "idle";
  /** Minutes since the process started. */
  startedAgo: number;
  /** Minutes since the registry's status last changed. */
  sinceAgo: number;
  /** `m(ago)` is the log minute `ago` minutes before now. */
  write: (b: LogBuilder, m: (ago: number) => number) => void;
  /** Subagents it launched in the background; `write` calls `launch` for each. */
  agents?: DemoAgent[];
  /** Waits on you (a question, or a finished turn): the live page's On you column. */
  onYou?: true;
}

/** A background subagent of a running demo session, with its own log and meta file. */
interface DemoAgent {
  id: string;
  type: string;
  description: string;
  /** What its log holds after its first prompt; `m` as in `LiveDemo.write`. */
  write: (s: LogBuilder, m: (ago: number) => number) => void;
}

/**
 * Usage whose input adds up to `context` tokens, which the live page reads as the context size:
 * mostly a cache read, plus the turn's new tokens written to the 1-hour cache as Claude Code does.
 */
function usageFor(context: number): TokenUsage {
  return { input: 200, output: 120, cacheRead: context - 3200, cache5m: 0, cache1h: 3000 };
}

/** A response carrying `context` tokens of input. */
function respond(b: LogBuilder, minute: number, context: number, text: string): void {
  b.response(minute, [{ type: "text", text }], usageFor(context));
}

/**
 * A tool call left without a result (still in flight, or a question not yet answered), in a
 * response carrying `context` tokens: the latest response is what the live page reads the context
 * size from, and `LogBuilder.toolUse` writes a fixed one.
 */
function inFlight(b: LogBuilder, minute: number, context: number, name: string, input: Rec): void {
  // One call in flight per session, so the session ID makes it unique
  const id = `toolu_live_${b.sessionId.slice(-6)}`;
  b.response(minute, [{ type: "tool_use", id, name, input }], usageFor(context));
}

/** A question to the person, left unanswered: the turn waits on it. */
function ask(b: LogBuilder, minute: number, context: number, question: string): void {
  inFlight(b, minute, context, "AskUserQuestion", {
    questions: [
      {
        question,
        header: "Scope",
        multiSelect: false,
        options: [
          { label: "Both", description: "Titles and body" },
          { label: "Body only", description: "Keep titles plain" },
        ],
      },
    ],
  });
}

/** Creates a task; tasks are numbered in the order they are created. */
function task(b: LogBuilder, minute: number, n: number, subject: string): void {
  const id = b.toolUse(minute, "TaskCreate", { subject, description: subject });
  b.toolResult(minute, id, `Task #${n} created successfully: ${subject}`);
}

function taskStatus(b: LogBuilder, minute: number, n: number, status: string): void {
  const id = b.toolUse(minute, "TaskUpdate", { taskId: String(n), status });
  b.toolResult(minute, id, `Updated task #${n} status`);
}

/** The call that launches `agent`, named after it so its meta file can point at the call. */
function agentCallId(agent: DemoAgent): string {
  return `toolu_agent_${agent.id}`;
}

/** Launches `agent` in the background: the call returns at once and the turn goes on. */
function launch(b: LogBuilder, minute: number, context: number, agent: DemoAgent): void {
  const id = agentCallId(agent);
  const input = {
    subagent_type: agent.type,
    description: agent.description,
    prompt: agent.description,
    run_in_background: true,
  };
  b.response(minute, [{ type: "tool_use", id, name: "Agent", input }], usageFor(context));
  b.toolResult(minute, id, "Async agent launched successfully.");
}

const PREVIEW_AGENTS: DemoAgent[] = [
  {
    id: "a7e1c0de5eed0001",
    type: "Explore",
    description: "Find where CI posts PR comments",
    write: (s, m) => {
      s.bash(m(8), "rg -l 'gh pr comment' .github", ".github/workflows/coverage.yml");
      const id = `toolu_agent_grep_${s.sessionId.slice(-6)}`;
      s.response(
        m(0.5),
        [
          {
            type: "tool_use",
            id,
            name: "Grep",
            input: { pattern: "GITHUB_TOKEN", path: ".github" },
          },
        ],
        usageFor(41_200),
      );
    },
  },
  {
    id: "a7e1c0de5eed0002",
    type: "code-reviewer",
    description: "Review the preview environment module",
    write: (s, m) => {
      s.bash(m(7), "git diff main -- modules/preview", "diff --git a/modules/preview/main.tf ...");
      s.text(m(1.2), "Two findings: the bucket name collides across PRs, and teardown skips DNS.");
    },
  },
];

const LIVE: LiveDemo[] = [
  {
    id: sid(201),
    project: "atlas",
    branch: "feature/search-highlight",
    title: "Highlight matches in search results",
    kind: "interactive",
    status: "busy",
    onYou: true,
    startedAgo: 48,
    sinceAgo: 3,
    write: (b, m) => {
      b.prompt(m(46), "Highlight the matched words in search results");
      // Within 15 minutes of the question, so it is in the same work block the card reads
      b.bash(m(12), "bun test src/search", "18 pass\n0 fail");
      ask(b, m(3), 61_400, "Highlight matches in document titles too, or only in the body?");
    },
  },
  {
    id: sid(202),
    project: "harbor",
    branch: "feature/dark-mode",
    title: "Dark mode for the settings pages (#91)",
    kind: "interactive",
    status: "idle",
    onYou: true,
    startedAgo: 95,
    sinceAgo: 6,
    write: (b, m) => {
      b.prompt(m(92), "Address the review on #91: the settings pages still use light-only colors");
      task(b, m(91), 1, "Move settings colors to theme tokens");
      task(b, m(91), 2, "Fix the invoice table's borders in dark mode");
      task(b, m(91), 3, "Check the charts' contrast");
      taskStatus(b, m(60), 1, "completed");
      taskStatus(b, m(25), 2, "completed");
      b.bash(m(8), "bun test", "64 pass\n0 fail");
      respond(b, m(6.2), 112_800, "Tokens are in and the tests pass.");
      b.turnEnd(m(6.1));
      b.system(m(6), "away_summary", {
        content:
          "Settings pages now use theme tokens and the invoice table reads well in dark mode; tests pass. Next is checking the usage charts' contrast before pushing #91.",
      });
    },
  },
  {
    id: sid(203),
    project: "infra",
    branch: "feature/preview-deploys",
    title: "Preview deploys for every PR",
    kind: "interactive",
    status: "busy",
    startedAgo: 130,
    sinceAgo: 1,
    write: (b, m) => {
      b.prompt(m(128), "Deploy a preview for every PR and post its URL on the PR");
      task(b, m(127), 1, "Add a preview environment module");
      task(b, m(127), 2, "Build and deploy on pull_request");
      task(b, m(127), 3, "Post the preview URL as a PR comment");
      task(b, m(127), 4, "Tear previews down when the PR closes");
      taskStatus(b, m(90), 1, "completed");
      taskStatus(b, m(50), 2, "completed");
      taskStatus(b, m(49), 3, "in_progress");
      for (const agent of PREVIEW_AGENTS) launch(b, m(9), 598_000, agent);
      b.bash(
        m(12),
        "make test",
        "--- FAIL: TestPreviewName (0.01s)\n    expected pr-214, got pr-0214",
        true,
      );
      inFlight(b, m(1), 612_400, "Bash", {
        command: "terraform plan -out=preview.plan",
        description: "Plan",
      });
    },
    agents: PREVIEW_AGENTS,
  },
  {
    id: sid(204),
    project: "atlas",
    branch: "main",
    title: "Backfill the search index on staging",
    kind: "bg",
    status: "busy",
    startedAgo: 22,
    sinceAgo: 21,
    write: (b, m) => {
      b.prompt(m(21), "Run the search index backfill on staging and report the timings");
      inFlight(b, m(4), 38_900, "Bash", {
        command: "bun scripts/backfill-search.ts --env staging --batch 500",
        description: "Backfill",
      });
    },
  },
  {
    id: sid(205),
    project: "field-notes",
    branch: "main",
    title: "Outline for a post on the search index",
    kind: "interactive",
    status: "idle",
    startedAgo: 140,
    sinceAgo: 52,
    write: (b, m) => {
      b.prompt(m(70), "Outline a post on how atlas's search index went from 1.8 s to 40 ms");
      respond(b, m(52), 27_300, "Here is an outline in five parts.");
      b.turnEnd(m(52));
    },
  },
  {
    id: sid(206),
    project: "harbor",
    branch: "main",
    title: "Storybook stories for the billing page",
    kind: "interactive",
    status: "idle",
    startedAgo: 260,
    sinceAgo: 200,
    write: (b, m) => {
      b.prompt(m(240), "Add Storybook stories for the billing page's states");
      b.bash(m(205), "bun run test-storybook", "12 pass\n0 fail");
      respond(b, m(200), 44_100, "Added stories for empty, paid and overdue.");
      b.turnEnd(m(200));
    },
  },
];

/** Writes a subagent's log and meta file beside its session's log at `sessionPath`. */
function writeAgentLog(
  sessionPath: string,
  live: LiveDemo,
  agent: DemoAgent,
  m: (ago: number) => number,
): void {
  const s = new LogBuilder(live.id, PROJECTS[live.project], live.branch, { agentId: agent.id });
  s.systemUser(m(9) + 0.05, agent.description);
  agent.write(s, m);
  const dir = join(sessionPath.replace(/\.jsonl$/, ""), "subagents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `agent-${agent.id}.jsonl`), s.toJsonl());
  writeFileSync(
    join(dir, `agent-${agent.id}.meta.json`),
    JSON.stringify({
      agentType: agent.type,
      description: agent.description,
      toolUseId: agentCallId(agent),
      requestShape: "background",
    }),
  );
}

/**
 * Writes the logs of the sessions running at `now` and returns their registry entries, for the
 * capture to pair with stand-in processes. Their blocks fall in the few hours before `now`
 * (`DEMO_NOW` in the capture), so they stay out of the calendar shots.
 */
export function writeLiveDemoLogs(claudeDir: string, now: number): LiveDemoEntry[] {
  const nowMinute = (now - minuteBase) / 60_000;
  return LIVE.map((live) => {
    const cwd = PROJECTS[live.project];
    const b = new LogBuilder(live.id, cwd, live.branch);
    b.meta("mode", { mode: "normal" });
    live.write(b, (ago) => nowMinute - ago);
    b.meta("ai-title", { aiTitle: live.title });
    const path = join(claudeDir, "projects", cwd.replace(/[/.]/g, "-"), `${live.id}.jsonl`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, b.toJsonl());
    for (const agent of live.agents ?? [])
      writeAgentLog(path, live, agent, (ago) => nowMinute - ago);
    return {
      sessionId: live.id,
      cwd,
      kind: live.kind,
      status: live.status,
      statusUpdatedAt: now - live.sinceAgo * 60_000,
      startedAt: now - live.startedAgo * 60_000,
      name: live.title,
      onYou: live.onYou === true,
    };
  });
}
