// Fictional sections with known answers, for measuring section summaries (`bun run eval:summary`).
// Real logs can't go into the repo, so each case is written from a pattern seen in them: a plan
// listed as done, a bare number, a vague leftover, the backlog recorded as an open item, a blocker
// buried in a file list, "resolved" claimed against the facts, a headline that talks about the task,
// a deliberate skip or the model's own doubt written as an open item, too many open items, and an
// automation run's headline that summarizes the loop's fixed instruction. A bad
// summary found in real use becomes a new case here.
import type { PromptInput } from "../../src/server/summarize/prompt.ts";
import type { OpenKind } from "../../src/shared/summaryBody.ts";
import type { SummaryLang } from "../../src/shared/summaryLang.ts";

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
   * The most open items allowed, when it is fewer than `MAX_OPEN` (in output.ts): 0 when nothing
   * in the section is left, 1 when one fair leftover (a pending question, a denied action) may be
   * listed.
   */
  maxOpen?: number;
  /** Terms the first open item must contain: the leftover that matters most. */
  leadOpen?: string[];
  /**
   * Labels of the `input.earlierOpen` items the section settled. Saying any other one is settled
   * counts against the summary: earlier items come from other sessions of the project too, about
   * other work.
   */
  settles?: string[];
  /**
   * Terms the headline must each contain (case-insensitive): what names the work, where a headline
   * has been seen to name something else (an automation run's fixed instruction, say).
   */
  headlineNames?: string[];
  /**
   * A headline and body that meet every expectation. They document the case, and the tests check
   * that they score perfectly, so a case can't ask for something no summary could give.
   */
  idealHeadline: string;
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
    idealHeadline: "日本語検索修正の PR #57 作成と CI 待ち",
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
    idealHeadline: "PR #210 のレビュー指摘 3 件の修正",
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
    idealHeadline: "--output の末尾改行の修正と #5 のクローズ",
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
    idealHeadline: "記事 why-sqlite の図版 2 枚とアップロード先待ち",
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
    idealHeadline: "Date parser port down to 10 failures",
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
    idealHeadline: "Local-time fix for midnight DST reminders",
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
    idealHeadline: "Partial rename of the timeout_s config key",
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
    idealHeadline: "SQLite job queue for outgoing emails",
    ideal: [
      "- Goal: Send emails through a job queue so a slow SMTP server doesn't block requests",
      "- Done:",
      "  - Added a SQLite-backed job queue in queue/sqlite.go",
      "- Resolved:",
      "  - Queue backend: SQLite rather than Redis, so there is no extra service to run",
      "  - Email queue: PR #12 merged, go test passes",
    ].join("\n"),
  },
  {
    id: "meta-one-denied-read",
    pattern: "a tiny section whose headline talks about the task (「…を記録する見出し」)",
    lang: "ja",
    input: {
      sessionTitle: "設定ファイルの確認",
      projectName: "billing",
      previous: [],
      digest: [
        "[User] .env.example の1行目だけ見せて",
        "  → Read: .env.example",
        "    ✗ failed: Permission to read .env.example was denied by a deny rule (Read(.env*))",
        "[Claude] 設定の拒否ルールで .env* の読み取りが禁止されているため、.env.example を開けませんでした。",
      ].join("\n"),
    },
    open: [],
    notResolved: ["確認済", "読み取った", "表示した"],
    notOpen: [],
    maxOpen: 1,
    idealHeadline: ".env.example の読み取りが拒否ルールで不可",
    ideal: [
      "- 目的: .env.example の 1 行目を確認する",
      "- やったこと:",
      "  - .env.example の読み取りを試みたが、拒否ルール Read(.env*) で拒否された",
    ].join("\n"),
  },
  {
    id: "meta-summary-request",
    pattern: 'work that is itself a summary, which invites "Here is the summary" as the headline',
    lang: "en",
    input: {
      sessionTitle: "Release notes for 1.4",
      projectName: "exporter",
      previous: [],
      facts: [
        "Commits and PRs:",
        "- commit 2a4b6c8 docs: note streaming exports in the changelog",
      ].join("\n"),
      digest: [
        "[User] Write a short summary of PR #88 for the release notes",
        "  → Bash: gh pr view 88",
        "  → Edit: CHANGELOG.md",
        "  → Bash: git commit -m 'docs: note streaming exports in the changelog'",
        '[Claude] Here is the summary I added under 1.4.0 in CHANGELOG.md: "Exports now stream rows instead of loading them all into memory (#88)."',
      ].join("\n"),
    },
    open: [],
    notResolved: [],
    notOpen: [],
    maxOpen: 1,
    idealHeadline: "Changelog entry for streaming exports in PR #88",
    ideal: [
      "- Goal: Write a short release-notes entry for PR #88",
      "- Done:",
      "  - Added an entry on streaming exports under 1.4.0 in CHANGELOG.md (commit 2a4b6c8)",
    ].join("\n"),
  },
  {
    id: "greeting-only",
    pattern:
      "a section with no work in it, whose headline explained itself (「作業の実体はなく…」)",
    lang: "ja",
    input: {
      sessionTitle: "こんにちは",
      projectName: null,
      previous: [],
      digest: [
        "[User] こんにちは。明日の天気はどうかな",
        "[Claude] こんにちは。どの地域の天気を知りたいですか？",
      ].join("\n"),
    },
    open: [],
    notResolved: [],
    notOpen: [],
    maxOpen: 1,
    idealHeadline: "明日の天気についての質問と地域の聞き返し",
    ideal: ["- 目的: 明日の天気を知る", "- やったこと:", "  - どの地域の天気かを聞き返した"].join(
      "\n",
    ),
  },
  {
    id: "deliberate-skip",
    pattern: "work deliberately left alone written as an open item (「X は対応しない」)",
    lang: "ja",
    input: {
      sessionTitle: "lint 警告の整理",
      projectName: "admin-ui",
      previous: [],
      facts: [
        "Commits and PRs:",
        "- commit 7e8f9a0 chore: remove unused imports and any types",
        "",
        "Tests:",
        "last run `npm run lint` passed (0 errors, 30 warnings)",
      ].join("\n"),
      digest: [
        "[User] lint の警告を片付けて",
        "  → Bash: npm run lint",
        "[Claude] 警告は3種類です: 未使用 import 12件、any 型 4件、legacy/ 配下の命名規則違反 30件。",
        "[User] legacy/ は来月まるごと消すから触らなくていい",
        "  → Edit: src/pages/users.tsx",
        "  → Edit: src/api/client.ts",
        "  → Bash: npm run lint",
        "  → Bash: git commit -m 'chore: remove unused imports and any types'",
        "[Claude] 未使用 import と any 型を直してコミットしました。legacy/ の命名規則違反 30 件は、来月削除するとのことなので対応していません。",
      ].join("\n"),
    },
    open: [],
    notResolved: [],
    notOpen: ["legacy", "命名規則"],
    maxOpen: 0,
    idealHeadline: "未使用 import と any 型の lint 警告の解消",
    ideal: [
      "- 目的: lint の警告を片付ける",
      "- やったこと:",
      "  - 未使用 import 12 件と any 型 4 件を修正",
      "- 解決:",
      "  - 未使用 import と any 型の警告: コミット 7e8f9a0、lint はエラー 0",
      "  - legacy/ の命名規則違反 30 件: 来月 legacy/ ごと削除するため対応しないと決定",
    ].join("\n"),
  },
  {
    id: "model-doubt",
    pattern: "the model's own doubt written as an open item (「判断の経緯が記録されていない」)",
    lang: "ja",
    input: {
      sessionTitle: "キャッシュ設定",
      projectName: "catalog",
      previous: [],
      facts: [
        "Commits and PRs:",
        "- commit 3c4d5e6 chore: set cache TTL to 300 seconds",
        "",
        "Tests:",
        "last run `npm test` passed (148 passed)",
      ].join("\n"),
      digest: [
        "[User] 商品キャッシュの TTL を 300 秒にして",
        "  → Edit: config/cache.yml",
        "  → Bash: npm test",
        "  → Bash: git commit -m 'chore: set cache TTL to 300 seconds'",
        "[Claude] 商品キャッシュの TTL を 300 秒に変更してコミットしました。テストも通っています。",
      ].join("\n"),
    },
    open: [],
    notResolved: [],
    notOpen: ["理由", "経緯", "根拠", "記録されて", "不明"],
    maxOpen: 0,
    idealHeadline: "商品キャッシュの TTL を 300 秒に変更",
    ideal: [
      "- 目的: 商品キャッシュの TTL を 300 秒にする",
      "- やったこと:",
      "  - config/cache.yml の TTL を 300 秒に変更",
      "- 解決:",
      "  - キャッシュ TTL の変更: コミット 3c4d5e6、テスト 148 件成功",
    ].join("\n"),
  },
  {
    id: "many-leftovers",
    pattern: "a long list of leftovers with the blocker among them, every one written as open",
    lang: "ja",
    input: {
      sessionTitle: "v2.3.0 リリース",
      projectName: "status-page",
      previous: ["v2.3.0 の変更点の取りまとめ"],
      facts: [
        "Commits and PRs:",
        "- commit 8d9e0f1 chore: release v2.3.0",
        "",
        "Tests:",
        "last run `make test` passed (ok)",
      ].join("\n"),
      digest: [
        "[User] v2.3.0 を出して、本番にもデプロイして",
        "  → Bash: git commit -m 'chore: release v2.3.0'",
        "  → Bash: git tag v2.3.0 && git push origin v2.3.0",
        "  → Bash: make deploy ENV=production",
        "    ✗ failed: 403 Forbidden: the deploy role cannot update the production service",
        "[Claude] v2.3.0 のタグを付けて push しました。本番デプロイは権限エラー (403) で止まっています。ほかに残っているのは、リリースノートの英訳、ドキュメントのスクリーンショット更新、CHANGELOG の誤字修正、古い v1 ブランチの削除、Slack での告知です。",
      ].join("\n"),
    },
    open: [
      {
        what: "the production deploy stopped by a 403",
        match: ["デプロイ", "403"],
        kinds: ["issue", "waiting"],
      },
    ],
    notResolved: ["デプロイ", "403"],
    notOpen: [],
    leadOpen: ["デプロイ", "403"],
    idealHeadline: "v2.3.0 のタグ付けと本番デプロイの権限エラー",
    ideal: [
      "- 目的: v2.3.0 をリリースし、本番にデプロイする",
      "- やったこと:",
      "  - リリースをコミットし、v2.3.0 のタグを付けて push",
      "- 残課題:",
      "  - [issue] 本番デプロイがデプロイ用ロールの権限エラー (403) で停止",
      "- 次の一手: デプロイ用ロールの権限を確認して本番デプロイをやり直す",
    ].join("\n"),
  },
  {
    id: "earlier-push-wait",
    pattern:
      "a wait for a push left open by an earlier session and settled by a later one (「main が origin より 2 コミット先、push 待ち」)",
    lang: "ja",
    input: {
      sessionTitle: "通知設定画面",
      projectName: "notes-app",
      previous: [],
      facts: [
        "Commits and PRs:",
        "- commit e4f5a6b feat: notification settings page",
        "",
        "Tests:",
        "last run `bun test` passed (230 pass / 0 fail)",
      ].join("\n"),
      earlierOpen: [
        {
          label: "O1",
          kind: "waiting",
          text: "main が origin より 2 コミット先。ユーザーの push 待ち",
          from: 'an earlier session ("検索の日本語対応")',
        },
        {
          label: "O2",
          kind: "todo",
          text: "ダークモードで検索結果のハイライト色が背景に埋もれるので調整",
          from: 'an earlier session ("検索結果のハイライト表示")',
        },
        {
          label: "O3",
          kind: "question",
          text: "通知メールの送信元アドレスを noreply にするか",
          from: 'an earlier session ("通知メールのテンプレート")',
        },
      ],
      digest: [
        "[User] 通知設定画面を作って。終わったら前の 2 コミットと一緒に push して",
        "  → Write: src/pages/NotificationSettings.tsx",
        "  → Bash: bun test",
        "  → Bash: git commit -m 'feat: notification settings page'",
        "  → Bash: git push origin main",
        "    a1b2c3d..e4f5a6b  main -> main",
        "[Claude] 通知設定画面を追加し、前の 2 コミットと合わせて main を origin に push しました。メール通知の頻度の選択肢（即時／日次）はまだ決まっていないので、ご確認ください。",
      ].join("\n"),
    },
    open: [
      {
        what: "the choice of email notification frequencies",
        match: ["頻度"],
        kinds: ["question", "waiting"],
      },
    ],
    notResolved: ["ハイライト", "送信元"],
    notOpen: ["push", "ハイライト", "送信元"],
    settles: ["O1"],
    idealHeadline: "通知設定画面の追加と main の push",
    ideal: [
      "- 目的: 通知設定画面を追加し、前回のコミットと合わせて push する",
      "- やったこと:",
      "  - 通知設定画面 NotificationSettings.tsx を追加してコミット",
      "  - main を origin に push（前回の 2 コミットを含む）",
      "- 解決:",
      "  - 通知設定画面: コミット e4f5a6b、テスト 230 件成功",
      "- 残課題:",
      "  - [question] メール通知の頻度の選択肢（即時か日次か）",
      "- 次の一手: 頻度の選択肢が決まったら通知設定画面に反映",
    ].join("\n"),
  },
  {
    id: "earlier-nearby-work",
    pattern:
      "earlier items from parallel sessions about nearby work, which this section mentions or touches without settling",
    lang: "en",
    input: {
      sessionTitle: "JSON export",
      projectName: "ledger-app",
      previous: [],
      facts: [
        "Commits and PRs:",
        "- commit 7b8c9d0 feat: export entries as JSON",
        "- commit 1c2d3e4 fix: set SameSite=Lax on the session cookie",
        "",
        "Tests:",
        "last run `npm test` passed (Tests: 88 passed, 88 total)",
      ].join("\n"),
      earlierOpen: [
        {
          label: "O1",
          kind: "todo",
          text: "Add tests for the CSV export's date column",
          from: 'an earlier session ("CSV export fixes")',
        },
        {
          label: "O2",
          kind: "issue",
          text: "Login fails on Safari: the session cookie is dropped",
          from: 'an earlier session ("Safari login bug")',
        },
        {
          label: "O3",
          kind: "waiting",
          text: "Waiting for the designer's icons for the export menu",
          from: 'an earlier session ("Export menu layout")',
        },
      ],
      digest: [
        "[User] Add a JSON export next to the CSV one, with tests",
        "  → Write: src/export/json.ts",
        "  → Edit: test/export.test.ts",
        "  → Bash: npm test",
        "  → Bash: git commit -m 'feat: export entries as JSON'",
        "[Claude] Added the JSON export with tests for its date and amount fields. The export menu still uses placeholder icons.",
        "",
        "[User] Also the Safari login: set SameSite=Lax on the session cookie",
        "  → Edit: src/auth/cookie.ts",
        "  → Bash: npm test",
        "  → Bash: git commit -m 'fix: set SameSite=Lax on the session cookie'",
        "[Claude] Set SameSite=Lax on the session cookie; all 88 tests pass. I checked the login flow against the cookie test, which covers Safari's behaviour.",
      ].join("\n"),
    },
    open: [],
    notResolved: ["date column", "icon"],
    notOpen: ["date column", "icon"],
    settles: ["O2"],
    idealHeadline: "JSON export and Safari login cookie fix",
    ideal: [
      "- Goal: Add a JSON export beside the CSV one, and fix the Safari login",
      "- Done:",
      "  - Added the JSON export with tests for its date and amount fields",
      "  - Set SameSite=Lax on the session cookie",
      "- Resolved:",
      "  - Safari login: SameSite=Lax on the session cookie (commit 1c2d3e4), 88 tests pass",
    ].join("\n"),
  },
  {
    id: "automation-iteration",
    pattern:
      "an automation run summarized as its fixed instruction (「Do one iteration of the loop」), while the issue it worked on was only in a tool result and the work in subagents' reports",
    lang: "en",
    input: {
      sessionTitle:
        "/goal Do one iteration of the loop, as your instructions say, until the bundle is in the outlet",
      projectName: "calendar-lib",
      automated: true,
      previous: [],
      facts: [
        "Commits and PRs:",
        "- commit 3f9a2c1 fix: ISO week numbers for the first days of January",
        "",
        "Tests:",
        "last run `bun test` passed (140 pass / 0 fail)",
      ].join("\n"),
      digest: [
        "[User] /goal Do one iteration of the loop, as your instructions say, until the bundle is in the outlet or you have reported why not",
        "  → Bash: cat /inlet/assignment.json",
        '    ← { "issue": 87, "title": "Week numbers are wrong for the first days of January" }',
        "  → Bash: git switch -c impl/87",
        "    ← Switched to a new branch 'impl/87'",
        "  → Agent: Implement issue 87",
        "    ← report: Fixed weekOf() to follow ISO 8601, so 2027-01-01 is week 53 of 2026; added 6 tests for January 1–4; bun test passes (140). The CLI's --week flag has its own copy of the old rule and still prints week 1 for 2027-01-01; I left it, since the issue covers the library only.",
        "  → Agent: Review the diff",
        "    ← report: No findings. The fix and its tests match the issue.",
        "  → Bash: git commit -m 'fix: ISO week numbers for the first days of January'",
        "  → Bash: git bundle create /outlet/decl.bundle main..impl/87",
        "  → ScheduleWakeup",
        "[Claude] loop: declared 3f9a2c1 for #87",
      ].join("\n"),
    },
    open: [
      {
        what: "the CLI's --week flag still on the old rule",
        match: ["--week", "CLI"],
        kinds: ["todo", "issue"],
      },
    ],
    notResolved: ["--week", "CLI"],
    notOpen: ["iteration", "wakeup", "outlet"],
    headlineNames: ["week"],
    idealHeadline: "ISO week number fix for early January (#87)",
    ideal: [
      "- Goal: Fix issue #87, wrong week numbers for the first days of January",
      "- Done:",
      "  - Made weekOf() follow ISO 8601 and added 6 tests for January 1–4",
      "  - A review subagent found nothing; committed 3f9a2c1 and bundled impl/87",
      "- Resolved:",
      "  - #87: weekOf() gives ISO weeks (commit 3f9a2c1), 140 tests pass",
      "- Open:",
      "  - [todo] The CLI's --week flag keeps its own copy of the old rule",
    ].join("\n"),
  },
];
