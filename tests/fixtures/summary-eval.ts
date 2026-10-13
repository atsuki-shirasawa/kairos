// Fictional sections with known answers, for measuring section summaries (`bun run eval:summary`).
// Real logs can't go into the repo, so each case is written from a pattern seen in them: a plan
// listed as done, a bare number, a vague leftover, the backlog recorded as an open item, a blocker
// buried in a file list, and "resolved" claimed against the facts. A bad summary found in real use
// becomes a new case here.
import type { PromptInput, SummaryLang } from "../../src/server/summarize/prompt.ts";
import type { OpenKind } from "../../src/shared/summaryBody.ts";

/** An open item the summary must contain. */
export interface ExpectedOpen {
  /** What it is about, for the report. */
  what: string;
  /** Any one of these (case-insensitive) in an open item's text counts as a match. */
  match: string[];
  /** Kinds that fit it; another kind still counts for recall but not for the kind score. */
  kinds: OpenKind[];
}

/** One fictional section and what its summary must and must not say. */
export interface EvalCase {
  id: string;
  /** The real-output pattern this case is written from. */
  pattern: string;
  lang: SummaryLang;
  input: PromptInput;
  open: ExpectedOpen[];
  /** Terms that must not appear under Resolved: work the facts show as not settled. */
  notResolved: string[];
  /** Terms that must not appear under Open: things that aren't this section's leftovers. */
  notOpen: string[];
  /**
   * A body that meets every expectation. It documents the case, and the tests check that it
   * scores perfectly, so a case can't ask for something no summary could give.
   */
  ideal: string;
}

/** The evaluation cases. */
export const EVAL_CASES: EvalCase[] = [
  {
    id: "plan-as-done",
    pattern: "a plan listed under Done (「マージ後に…クローズ予定」)",
    lang: "ja",
    input: {
      sessionTitle: "検索の日本語対応",
      projectName: "notes-app",
      previous: ["検索インデックスの日本語分かち書き対応"],
      facts: [
        "Commits and PRs:",
        "- commit 4e1a9c2 feat: match Japanese words in search",
        "- opened PR #57 feat: match Japanese words in search",
        "",
        "Tests:",
        "last run `bun test` passed (212 pass / 0 fail)",
      ].join("\n"),
      digest: [
        "[User] 日本語検索の修正をPRにして",
        "  → Bash: git commit -m 'feat: match Japanese words in search'",
        "  → Bash: bun test",
        "  → Bash: gh pr create --fill",
        "[Claude] PR #57 を作成しました。CI が走っています。",
        "",
        "[User] CI通ったらマージして、#41 も閉じておいて",
        "[Claude] 了解です。CI の完了を待ってからマージし、マージ後に #41 をクローズする予定です。現在 CI は実行中です。",
      ].join("\n"),
    },
    open: [
      { what: "CI and merging PR #57", match: ["CI", "#57", "マージ"], kinds: ["waiting"] },
      { what: "closing #41 after the merge", match: ["#41"], kinds: ["todo", "waiting"] },
    ],
    notResolved: ["マージ済", "merged", "#41"],
    notOpen: [],
    ideal: [
      "- 目的: 日本語検索の修正を PR にし、CI 通過後にマージして #41 を閉じる",
      "- やったこと:",
      "  - 修正をコミットし PR #57 を作成",
      "- 解決:",
      "  - 日本語検索の修正: コミット 4e1a9c2、テスト 212 件すべて成功",
      "- 残課題:",
      "  - [waiting] PR #57 の CI 完了待ち、通ればマージ",
      "  - [todo] マージ後に #41 をクローズ",
      "- 次の一手: CI の結果を見て PR #57 をマージ",
    ].join("\n"),
  },
  {
    id: "vague-leftovers",
    pattern: "a vague leftover (「対応しなかった項目（残りの指摘）」)",
    lang: "ja",
    input: {
      sessionTitle: "注文APIのレビュー対応",
      projectName: "shop-api",
      previous: [],
      facts: [
        "Commits and PRs:",
        "- commit 9b03f11 fix: validate quantity and currency in createOrder",
        "",
        "Tests:",
        "last run `pytest` passed (88 passed)",
      ].join("\n"),
      digest: [
        "[User] PR #210 のレビュー指摘に対応して。5件ある",
        "[Claude] 指摘は次の5件です: (1) quantity の負数チェック (2) currency の検証 (3) エラーメッセージの文言 (4) listOrders の N+1 クエリ (5) orders.user_id のインデックス不足",
        "  → Edit: app/orders.py",
        "  → Bash: pytest",
        "  → Bash: git commit -m 'fix: validate quantity and currency in createOrder'",
        "[Claude] (1)〜(3) を修正してコミットしました。(4) の N+1 は listOrders の書き換えが大きく、(5) のインデックスはマイグレーションが必要なため、今回は対応していません。",
      ].join("\n"),
    },
    open: [
      {
        what: "the N+1 query in listOrders",
        match: ["N+1", "listOrders"],
        kinds: ["issue", "todo"],
      },
      {
        what: "the missing index on orders.user_id",
        match: ["user_id", "インデックス"],
        kinds: ["issue", "todo"],
      },
    ],
    notResolved: ["N+1", "user_id", "インデックス"],
    notOpen: [],
    ideal: [
      "- 目的: PR #210 のレビュー指摘 5 件に対応する",
      "- やったこと:",
      "  - quantity の負数チェック、currency の検証、エラーメッセージの文言を修正",
      "- 解決:",
      "  - 指摘 3 件（quantity・currency・文言）: コミット 9b03f11、pytest 88 件成功",
      "- 残課題:",
      "  - [issue] listOrders の N+1 クエリ（書き換えが大きいため見送り）",
      "  - [issue] orders.user_id のインデックス不足（マイグレーションが必要）",
    ].join("\n"),
  },
  {
    id: "backlog-as-open",
    pattern: "the backlog order recorded as an open item (「次の issue は #6」)",
    lang: "ja",
    input: {
      sessionTitle: "issue を順に片付ける",
      projectName: "cli-tool",
      previous: ["#4 設定ファイルの読み込み順を修正"],
      facts: [
        "Commits and PRs:",
        "- commit 1d2c3b4 fix: keep trailing newline in --output file",
        "",
        "Issues:",
        "- closed #5",
        "",
        "Tests:",
        "last run `cargo test` passed (test result: ok. 64 passed)",
      ].join("\n"),
      digest: [
        "[User] 次は #5 をお願い",
        "  → Edit: src/output.rs",
        "  → Bash: cargo test",
        "  → Bash: git commit -m 'fix: keep trailing newline in --output file'",
        "  → Bash: gh issue close 5",
        "[Claude] #5 を修正してクローズしました。バックログの次の issue は #6（色出力のオプション）です。",
      ].join("\n"),
    },
    open: [],
    notResolved: [],
    notOpen: ["#6", "色出力"],
    ideal: [
      "- 目的: #5（--output のファイル末尾の改行）を直す",
      "- やったこと:",
      "  - src/output.rs で末尾の改行を保つよう修正",
      "- 解決:",
      "  - #5: コミット 1d2c3b4、cargo test 64 件成功、issue をクローズ",
    ].join("\n"),
  },
  {
    id: "buried-blocker",
    pattern:
      "a blocker buried at the end of a file list (「…画像2枚生成。…アップロード方法選択待ち」)",
    lang: "ja",
    input: {
      sessionTitle: "ブログ記事の図版",
      projectName: "blog",
      previous: [],
      facts: [
        "Questions Claude asked, with the answers:",
        "- 画像はどこにアップロードしますか？ → (no answer)",
      ].join("\n"),
      digest: [
        "[User] 記事 2026-10-why-sqlite に図を2枚つけて",
        "  → Write: posts/2026-10-why-sqlite/fig-wal.svg",
        "  → Write: posts/2026-10-why-sqlite/fig-pages.svg",
        "  → Edit: posts/2026-10-why-sqlite/index.md",
        "  → AskUserQuestion: 画像はどこにアップロードしますか？",
        "[Claude] fig-wal.svg と fig-pages.svg を作成し、index.md に参照を追加しました。画像のアップロード先（リポジトリ同梱か CDN か）の選択をお待ちしています。決まるまで記事は公開できません。",
      ].join("\n"),
    },
    open: [
      {
        what: "the user's choice of where to upload the images",
        match: ["アップロード", "upload", "CDN"],
        kinds: ["waiting", "question"],
      },
    ],
    notResolved: ["アップロード済", "公開済", "uploaded", "published"],
    notOpen: [],
    ideal: [
      "- 目的: 記事 2026-10-why-sqlite に図を 2 枚つける",
      "- やったこと:",
      "  - fig-wal.svg と fig-pages.svg を作成し index.md から参照",
      "- 残課題:",
      "  - [waiting] 画像のアップロード先（リポジトリ同梱か CDN か）の選択待ち。決まるまで公開できない",
      "- 次の一手: アップロード先が決まったら画像を置いて記事を公開",
    ].join("\n"),
  },
  {
    id: "bare-number",
    pattern: "a number without what it counts (「ケース数 517/10」)",
    lang: "en",
    input: {
      sessionTitle: "Port the date parser",
      projectName: "datekit",
      previous: [],
      facts: [
        "Tests:",
        "last run `npm test` FAILED (Tests: 10 failed, 517 passed, 527 total); 2 earlier run(s) failed",
      ].join("\n"),
      digest: [
        "[User] Port the remaining parser cases from the old library and get the suite green",
        "  → Edit: src/parse.ts",
        "  → Bash: npm test",
        "    ✗ failed: Tests: 31 failed, 496 passed, 527 total",
        "  → Edit: src/parse.ts",
        "  → Bash: npm test",
        "    ✗ failed: Tests: 10 failed, 517 passed, 527 total",
        "[Claude] Down to 10 failures, all in ISO week dates (2026-W01-1 style). I'll handle week dates next.",
      ].join("\n"),
    },
    open: [
      { what: "the 10 failing ISO week date cases", match: ["week"], kinds: ["todo", "issue"] },
    ],
    notResolved: ["green", "all pass", "suite pass", "week"],
    notOpen: [],
    ideal: [
      "- Goal: Port the remaining parser cases from the old library and get the suite passing",
      "- Done:",
      "  - Ported parser cases in src/parse.ts; failing tests went from 31 to 10 of 527",
      "- Open:",
      "  - [todo] 10 failing tests, all ISO week dates (2026-W01-1 style)",
      "- Next: Handle ISO week dates in the parser",
    ].join("\n"),
  },
  {
    id: "claimed-fix-test-failed",
    pattern: "the last reply says fixed while the last test run failed",
    lang: "en",
    input: {
      sessionTitle: "Timezone bug in reminders",
      projectName: "remindme",
      previous: [],
      facts: [
        "Tests:",
        "last run `bun test` FAILED (1 fail: reminders > fires at local midnight across DST)",
      ].join("\n"),
      digest: [
        "[User] Reminders set for midnight fire an hour early after the DST change. Fix it",
        "  → Edit: src/schedule.ts",
        "  → Bash: bun test",
        "    ✗ failed: (fail) reminders > fires at local midnight across DST",
        "[Claude] I've fixed the DST offset calculation in schedule.ts by computing the next run in local time. The timezone bug should now be fixed.",
      ].join("\n"),
    },
    open: [
      {
        what: "the DST test still failing",
        match: ["DST", "midnight", "fail"],
        kinds: ["todo", "issue"],
      },
    ],
    notResolved: ["DST", "timezone", "midnight"],
    notOpen: [],
    ideal: [
      "- Goal: Fix reminders set for midnight firing an hour early after the DST change",
      "- Done:",
      "  - Changed src/schedule.ts to compute the next run in local time",
      "- Open:",
      "  - [todo] The DST test (fires at local midnight across DST) still fails after the change",
      "- Next: Find why the DST test still fails",
    ].join("\n"),
  },
  {
    id: "interrupted",
    pattern: "work cut off by an interrupt, then reported as done",
    lang: "en",
    input: {
      sessionTitle: "Rename config keys",
      projectName: "deployer",
      previous: [],
      facts: ["Interrupted by the user:", "1 time(s)"].join("\n"),
      digest: [
        "[User] Rename `timeout_s` to `timeout` across the config loader, docs and examples",
        "  → Edit: src/config.ts",
        "  → Edit: docs/config.md",
        "[User] [Request interrupted by user]",
        "[User] stop, I need to check something with the team first",
        "[Claude] Understood. I renamed the key in src/config.ts and docs/config.md; the examples/ directory is not updated yet.",
      ].join("\n"),
    },
    open: [
      { what: "the examples/ directory not updated", match: ["example"], kinds: ["todo"] },
      {
        what: "the user checking with the team",
        match: ["team"],
        kinds: ["waiting", "question"],
      },
    ],
    notResolved: ["example", "rename complete", "renamed across"],
    notOpen: [],
    ideal: [
      "- Goal: Rename `timeout_s` to `timeout` across the config loader, docs and examples",
      "- Done:",
      "  - Renamed the key in src/config.ts and docs/config.md before the user stopped the work",
      "- Open:",
      "  - [todo] examples/ still use `timeout_s`",
      "  - [waiting] The user is checking the rename with the team",
    ].join("\n"),
  },
  {
    id: "decision-and-clean-finish",
    pattern: "a finished section with a decision: nothing left open, nothing invented",
    lang: "en",
    input: {
      sessionTitle: "Pick a queue for email jobs",
      projectName: "mailer",
      previous: [],
      facts: [
        "Commits and PRs:",
        "- commit 5f6e7d8 feat: send emails through a SQLite-backed job queue",
        "- merged PR https://github.com/me/mailer/pull/12",
        "",
        "Tests:",
        "last run `go test ./...` passed (ok  mailer/queue 0.41s)",
        "",
        "Questions Claude asked, with the answers:",
        "- Redis or SQLite for the job queue? → SQLite, no extra service to run",
      ].join("\n"),
      digest: [
        "[User] Emails should go through a job queue so a slow SMTP server doesn't block requests",
        "  → AskUserQuestion: Redis or SQLite for the job queue?",
        "  → Write: queue/sqlite.go",
        "  → Bash: go test ./...",
        "  → Bash: gh pr merge 12 --squash",
        "[Claude] Implemented the SQLite-backed queue, tests pass, and PR #12 is merged.",
      ].join("\n"),
    },
    open: [],
    notResolved: [],
    notOpen: ["Redis", "#12"],
    ideal: [
      "- Goal: Send emails through a job queue so a slow SMTP server doesn't block requests",
      "- Done:",
      "  - Added a SQLite-backed job queue in queue/sqlite.go",
      "- Resolved:",
      "  - Queue backend: SQLite rather than Redis, so there is no extra service to run",
      "  - Email queue: PR #12 merged, go test passes",
    ].join("\n"),
  },
];
