// A fictional week of Claude Code work for the screenshots in docs/images/: four projects, sections
// of realistic length (some running in parallel), commits and PRs, and the summaries and recaps the
// summarizer would have written. Nothing here comes from real logs.
import type { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadRecapInput } from "../../src/server/summarize/recap.ts";
import { saveRecap, saveSummary } from "../../src/server/summarize/store.ts";
import { at, LogBuilder } from "../../tests/fixtures/builder.ts";

/** Time zone the demo week is laid out in; the capture renders in the same zone. */
export const DEMO_TZ = "Asia/Tokyo";
const OFFSET = "+09:00";

/**
 * Sunday of the demo week, `YYYY-MM-DD`. Weeks start on Sunday in the app, and recaps are keyed by
 * that period, so the seeded ones must start here to be found.
 */
export const DEMO_WEEK = "2026-09-27";
/** The day for the day-view screenshot: a long block there shows its summary body. */
export const DEMO_DAY = "2026-09-30";

const PROJECTS = {
  atlas: "/Users/me/dev/atlas",
  harbor: "/Users/me/dev/harbor",
  "field-notes": "/Users/me/dev/field-notes",
  infra: "/Users/me/dev/infra",
} as const;

type ProjectKey = keyof typeof PROJECTS;

interface DemoSection {
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
  /** Left out for a short section, which gets only a headline. */
  summary?: { goal: string; done: string[]; outcome: string };
}

interface DemoSession {
  id: string;
  project: ProjectKey;
  branch: string;
  title: string;
  sections: DemoSection[];
}

const sid = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** The session opened in the drawer for the week screenshot. */
export const DRAWER_SESSION = sid(9);

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
          outcome: "Two commits; opened PR #214",
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
          outcome: "One commit pushed to #214; review approved",
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
          outcome: "Fixed and committed; one flaky snapshot test updated",
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
          outcome: "Draft ready for a read-through",
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
          outcome: "Two commits on `feature/billing-page`; PR still to open",
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
          outcome: "PR #88 open",
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
          outcome: "Cause found; index planned for Wednesday",
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
          outcome: "PR #12 opened",
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
          outcome: "Fixed in PR #219",
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
          outcome: "Builds again; committed",
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
          outcome: "Three commits on `feature/search-index`; PR after a review of the migration",
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
          outcome: "PR #221 open",
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
          outcome: "Published",
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
          outcome: "Two commits; copy still to be reviewed",
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
          outcome: "Applied to staging and committed",
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
          outcome: "Changes requested on #91",
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
          outcome: "Release notes committed; tag on Monday",
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
          outcome: "PR #93 open",
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
          outcome: "Outline saved as a draft",
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
  return (Date.parse(`2026-${day}T${time}:00${OFFSET}`) - minuteBase) / 60_000;
}

let commitSeq = 0;

/** Writes one section: its prompts, tool calls every few minutes, commits, an optional PR. */
function writeSection(b: LogBuilder, s: DemoSection, project: ProjectKey): void {
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
          file_path: `${PROJECTS[project]}/${file}`,
          old_string: "",
          new_string: "// …",
        });
        b.toolResult(t, id, "The file has been updated.", {
          result: { filePath: `${PROJECTS[project]}/${file}` },
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
      writePr(b, s, project, end);
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
function writePr(b: LogBuilder, s: DemoSection, project: ProjectKey, end: number): void {
  if (s.pr) {
    b.ghPrCreate(end - 1.5, `gh pr create --title "${s.pr.title}" --body "…"`, {
      number: s.pr.number,
      repository: `me/${project}`,
    });
  }
}

/** Writes the demo sessions as jsonl under `<claudeDir>/projects`, laid out like `~/.claude`. */
export function writeDemoLogs(claudeDir: string): void {
  for (const session of [...PREVIOUS_WEEK, ...SESSIONS]) {
    const cwd = PROJECTS[session.project];
    const b = new LogBuilder(session.id, cwd, session.branch);
    b.meta("mode", { mode: "normal" });
    for (const section of session.sections) writeSection(b, section, session.project);
    b.meta("ai-title", { aiTitle: session.title });
    const path = join(claudeDir, "projects", cwd.replace(/[/.]/g, "-"), `${session.id}.jsonl`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, b.toJsonl());
  }
}

/**
 * Stores the summaries and recaps the summarizer would have written, through its own store
 * functions, so the screenshots show summarized blocks without running `claude -p`.
 * Run after ingesting the demo logs.
 */
export function seedDemoSummaries(db: Database): void {
  const createdAt = Date.parse(`2026-10-02T18:00:00${OFFSET}`);
  for (const session of [...PREVIOUS_WEEK, ...SESSIONS]) {
    const segments = db
      .query<{ start: number; end: number }, [string]>(
        "SELECT start, end FROM segments WHERE session_id = ? ORDER BY start",
      )
      .all(session.id);
    if (segments.length !== session.sections.length) {
      throw new Error(
        `${session.id}: ${segments.length} blocks ingested, ${session.sections.length} written`,
      );
    }
    segments.forEach((seg, i) => {
      const s = session.sections[i] as DemoSection;
      saveSummary(
        db,
        { sessionId: session.id, start: seg.start },
        { headline: s.headline, body: s.summary ? summaryBody(s.summary) : "" },
        { model: "haiku", coveredUntil: seg.end, createdAt },
      );
    });
  }
  seedRecaps(db, createdAt);
}

/** A section summary body in the summarizer's goal / done / outcome shape. */
function summaryBody(s: NonNullable<DemoSection["summary"]>): string {
  return [
    `- Goal: ${s.goal}`,
    "- Done:",
    ...s.done.map((d) => `  - ${d}`),
    `- Outcome: ${s.outcome}`,
  ].join("\n");
}

/** Recaps for the demo week, keyed by the same period the summary view asks for. */
function seedRecaps(db: Database, createdAt: number): void {
  const from = Date.parse(`${DEMO_WEEK}T00:00:00${OFFSET}`);
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
