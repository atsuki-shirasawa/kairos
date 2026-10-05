import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "../../src/server/api/app.ts";
import { EventHub } from "../../src/server/events.ts";
import { buildDigest } from "../../src/server/summarize/digest.ts";
import { buildPrompt, parseSummary } from "../../src/server/summarize/prompt.ts";
import { Summarizer } from "../../src/server/summarize/summarizer.ts";
import type { SessionDetail } from "../../src/shared/api.ts";
import { SUMMARY_MIN_DURATION_MS, SUMMARY_MIN_PROMPTS } from "../../src/shared/sections.ts";
import { SID } from "../fixtures/ids.ts";
import { min, setup } from "./ingest/helpers.ts";

let db: Database;
let prompts: string[];
let reply: (prompt: string) => Promise<string>;
let now: number;
let summarizer: Summarizer;

beforeEach(() => {
  const s = setup();
  s.ingester.scan();
  db = s.db;
  prompts = [];
  reply = async () =>
    "# PR の作成とタイトル変更\n\n- 目的: PR を出す\n- やったこと: e2e を流して PR #42 を作成\n- 結果: 完了";
  now = min(10_000);
  summarizer = new Summarizer(
    db,
    (p) => {
      prompts.push(p);
      return reply(p);
    },
    { now: () => now, model: "test-model" },
  );
});

const summaryOf = (sid: string, start: number) =>
  db
    .query<{ headline: string; body: string; covered_until: number }, [string, number]>(
      "SELECT headline, body, covered_until FROM summaries WHERE session_id = ? AND start = ?",
    )
    .get(sid, start);

/** 短いセクションに見出しを付けた扱いにする。本文まで作る対象の選び方だけを見るため。 */
const skipTitles = () =>
  db.run(
    `INSERT INTO summaries
     SELECT session_id, start, 'x', '', 'm', end, 0 FROM segments
     WHERE end - start < ${SUMMARY_MIN_DURATION_MS} AND prompt_count < ${SUMMARY_MIN_PROMPTS}`,
  );

describe("Summarizer", () => {
  test("自動の対象は終わったセクション。短いものは見出しだけ、長いか発言の多いものは本文まで", () => {
    const picked: string[] = [];
    for (let t = summarizer.next(); t; t = summarizer.next()) {
      picked.push(`${t.sessionId.slice(0, 4)}@${(t.start - min(0)) / 60_000}:${t.mode}`);
      db.query("INSERT INTO summaries VALUES (?, ?, 'x', 'y', 'm', 1e15, 0)").run(
        t.sessionId,
        t.start,
      );
    }
    // 本文まで作るのは basic の 45 分台（発言 2）と compaction の 380 分台（発言 2）だけ
    expect(picked.filter((p) => p.endsWith(":summary")).sort()).toEqual([
      "1111@45:summary",
      "7777@380:summary",
    ]);
    // loop の 150 分台（発言 1・1 分）のような短いセクションは見出しだけ
    expect(picked).toContain("2222@150:title");
    expect(picked).toContain("1111@0:title");
  });

  test("要約して保存し、もう一度は選ばない", async () => {
    skipTitles();
    const target = { sessionId: SID.basic, start: min(45) };
    expect(await summarizer.summarize(target)).toBe(true);
    expect(summaryOf(SID.basic, min(45))).toEqual({
      headline: "PR の作成とタイトル変更",
      body: "- 目的: PR を出す\n- やったこと: e2e を流して PR #42 を作成\n- 結果: 完了",
      covered_until: min(50.2),
    });
    expect(summarizer.next()).toMatchObject({ sessionId: SID.compaction });
  });

  test("プロンプトには、そのセクションの会話と、前のセクションの見出しを含める", async () => {
    await summarizer.summarize({ sessionId: SID.basic, start: min(45) });
    const p = prompts[0] ?? "";
    expect(p).toContain("セッション名: ログイン機能");
    expect(p).toContain("- ログインフォームを実装して。バリデーションも付けてほしい"); // 前のセクション
    expect(p).toContain("[ユーザー] PR を作って");
    expect(p).toContain("→ Bash: gh pr create --fill");
    expect(p).not.toContain("[ユーザー] ログインフォームを実装して"); // 前のセクションの会話は含めない
  });

  test("最後のセクションは、最後の活動から 30 分たつまで待つ", () => {
    skipTitles();
    now = min(50.2) + 10 * 60_000;
    expect(summarizer.next()).toBeNull();
    now = min(50.2) + 31 * 60_000;
    expect(summarizer.next()).toMatchObject({ sessionId: SID.basic, start: min(45) });
  });

  test("7 日より前のセクションは自動では作らないが、頼まれれば作る", async () => {
    skipTitles();
    now = min(50.2) + 8 * 24 * 60 * 60_000;
    expect(summarizer.next()).toBeNull();
    summarizer.request(SID.basic, min(0)); // 短いセクションでも頼まれれば作る
    expect(summarizer.isPending(SID.basic, min(0))).toBe(true);
    expect(summarizer.next()).toEqual({ sessionId: SID.basic, start: min(0), mode: "summary" });
  });

  test("失敗は理由を記録し、時間をおいて再試行する", async () => {
    skipTitles();
    reply = async () => {
      throw new Error("Not logged in");
    };
    const target = { sessionId: SID.basic, start: min(45) };
    expect(await summarizer.summarize(target)).toBe(false);
    expect(summarizer.errorOf(SID.basic, min(45))).toBe("Not logged in");
    db.query("INSERT INTO summaries VALUES (?, ?, 'x', 'y', 'm', 1e15, 0)").run(
      SID.compaction,
      min(380),
    );
    expect(summarizer.next()).toBeNull(); // 再試行の時刻までは飛ばす
    now += 61_000;
    expect(summarizer.next()).toEqual({ ...target, mode: "summary" });
  });

  test("短いセクションは見出しだけを作り、本文は空にする", async () => {
    reply = async () => "ログイン画面の下調べ\n\n- 余計な本文";
    const target = { sessionId: SID.basic, start: min(0), mode: "title" as const };
    expect(await summarizer.summarize(target)).toBe(true);
    expect(prompts[0]).toContain("見出しを、日本語で 1 行だけ");
    expect(summaryOf(SID.basic, min(0))).toMatchObject({
      headline: "ログイン画面の下調べ",
      body: "",
    });
    expect(summarizer.next()).not.toMatchObject({ sessionId: SID.basic, start: min(0) });
  });

  test("要約が古くなったら（セクションが続いたら）作り直す", async () => {
    skipTitles();
    db.query("INSERT INTO summaries VALUES (?, ?, 'x', 'y', 'm', ?, 0)").run(
      SID.compaction,
      min(380),
      min(381),
    );
    db.query("INSERT INTO summaries VALUES (?, ?, 'x', 'y', 'm', ?, 0)").run(
      SID.basic,
      min(45),
      min(50.2),
    );
    expect(summarizer.next()).toEqual({
      sessionId: SID.compaction,
      start: min(380),
      mode: "summary",
    });
  });
});

test("API: 要約を頼むと 202 を返し、作っている最中は pending になる", async () => {
  let release: (v: string) => void = () => {};
  reply = () => new Promise((r) => (release = r));
  const app = createApp({ db, events: new EventHub(), summarizer, now: () => now });
  const res = await app.request(
    `http://127.0.0.1/api/sessions/${SID.basic}/sections/${min(0)}/summary`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  expect(res.status).toBe(202);
  const d = (await (
    await app.request(`http://127.0.0.1/api/sessions/${SID.basic}`)
  ).json()) as SessionDetail;
  expect(d.sections[0]?.pending).toBe(true);
  const done = summarizer.summarize(summarizer.next() ?? { sessionId: "", start: 0 });
  release("ログインフォームの実装\n\n- 目的: …");
  expect(await done).toBe(true);
  expect(summaryOf(SID.basic, min(0))?.headline).toBe("ログインフォームの実装");
});

describe("prompt", () => {
  test("parseSummary は見出しの飾りを外す", () => {
    expect(parseSummary("# 「API 層の整理」\n\n- 目的: x")).toEqual({
      headline: "API 層の整理",
      body: "- 目的: x",
    });
    expect(parseSummary("見出し: **ログイン実装**\n- 結果: 完了")).toEqual({
      headline: "ログイン実装",
      body: "- 結果: 完了",
    });
    expect(parseSummary("   \n")).toBeNull();
  });

  test("buildDigest は長すぎれば最初と最後を残す", () => {
    const messages = [
      { kind: "prompt", text: "最初の依頼", tool_name: null },
      ...Array.from({ length: 200 }, () => ({
        kind: "assistant",
        text: "x".repeat(500),
        tool_name: null,
      })),
      { kind: "prompt", text: "最後の依頼", tool_name: null },
    ];
    const d = buildDigest(messages, 3000);
    expect(d.startsWith("[ユーザー] 最初の依頼")).toBe(true);
    expect(d.endsWith("[ユーザー] 最後の依頼")).toBe(true);
    expect(d).toContain("中略");
  });

  test("buildPrompt は最初のセクションならそう書く", () => {
    expect(
      buildPrompt({ sessionTitle: "t", projectName: null, previous: [], digest: "d" }),
    ).toContain("このセッションの最初の作業です。");
  });
});
