import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "../../src/server/api/app.ts";
import { EventHub } from "../../src/server/events.ts";
import { buildDigest } from "../../src/server/summarize/digest.ts";
import { buildPrompt, buildTitlePrompt, parseSummary } from "../../src/server/summarize/prompt.ts";
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
    "# Creating the PR and renaming it\n\n- Goal: open a PR\n- Done: ran e2e and created PR #42\n- Outcome: finished";
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

/** Marks short sections as already titled, to look only at how full-summary targets are picked. */
const skipTitles = () =>
  db.run(
    `INSERT INTO summaries
     SELECT session_id, start, 'x', '', 'm', end, 0 FROM segments
     WHERE end - start < ${SUMMARY_MIN_DURATION_MS} AND prompt_count < ${SUMMARY_MIN_PROMPTS}`,
  );

describe("Summarizer", () => {
  test("automatic targets are finished sections: short ones get a headline, long or busy ones a full summary", () => {
    const picked: string[] = [];
    for (let t = summarizer.next(); t; t = summarizer.next()) {
      picked.push(`${t.sessionId.slice(0, 4)}@${(t.start - min(0)) / 60_000}:${t.mode}`);
      db.query("INSERT INTO summaries VALUES (?, ?, 'x', 'y', 'm', 1e15, 0)").run(
        t.sessionId,
        t.start,
      );
    }
    // Only basic at 45 min (2 prompts) and compaction at 380 min (2 prompts) get a full summary
    expect(picked.filter((p) => p.endsWith(":summary")).sort()).toEqual([
      "1111@45:summary",
      "7777@380:summary",
    ]);
    // Short sections like loop at 150 min (1 prompt, 1 minute) get only a headline
    expect(picked).toContain("2222@150:title");
    expect(picked).toContain("1111@0:title");
  });

  test("summarizes, saves, and does not pick the section again", async () => {
    skipTitles();
    const target = { sessionId: SID.basic, start: min(45) };
    expect(await summarizer.summarize(target)).toBe(true);
    expect(summaryOf(SID.basic, min(45))).toEqual({
      headline: "Creating the PR and renaming it",
      body: "- Goal: open a PR\n- Done: ran e2e and created PR #42\n- Outcome: finished",
      covered_until: min(50.2),
    });
    expect(summarizer.next()).toMatchObject({ sessionId: SID.compaction });
  });

  test("the prompt includes the section's conversation and the earlier sections' headlines", async () => {
    await summarizer.summarize({ sessionId: SID.basic, start: min(45) });
    const p = prompts[0] ?? "";
    expect(p).toContain("Session title: ログイン機能");
    expect(p).toContain("- ログインフォームを実装して。バリデーションも付けてほしい"); // earlier section
    expect(p).toContain("[User] PR を作って");
    expect(p).toContain("→ Bash: gh pr create --fill");
    expect(p).not.toContain("[User] ログインフォームを実装して"); // not the earlier section's conversation
  });

  test("waits until 30 minutes after the last activity for the final section", () => {
    skipTitles();
    now = min(50.2) + 10 * 60_000;
    expect(summarizer.next()).toBeNull();
    now = min(50.2) + 31 * 60_000;
    expect(summarizer.next()).toMatchObject({ sessionId: SID.basic, start: min(45) });
  });

  test("sections older than 7 days are not done automatically, but are when requested", async () => {
    skipTitles();
    now = min(50.2) + 8 * 24 * 60 * 60_000;
    expect(summarizer.next()).toBeNull();
    summarizer.request(SID.basic, min(0)); // even a short section, when requested
    expect(summarizer.isPending(SID.basic, min(0))).toBe(true);
    expect(summarizer.next()).toEqual({ sessionId: SID.basic, start: min(0), mode: "summary" });
  });

  test("records the reason for a failure and retries later", async () => {
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
    expect(summarizer.next()).toBeNull(); // skipped until the retry time
    now += 61_000;
    expect(summarizer.next()).toEqual({ ...target, mode: "summary" });
  });

  test("short sections get only a headline with an empty body", async () => {
    reply = async () => "Login screen research\n\n- extra body";
    const target = { sessionId: SID.basic, start: min(0), mode: "title" as const };
    expect(await summarizer.summarize(target)).toBe(true);
    expect(prompts[0]).toContain("single-line headline in English");
    expect(summaryOf(SID.basic, min(0))).toMatchObject({
      headline: "Login screen research",
      body: "",
    });
    expect(summarizer.next()).not.toMatchObject({ sessionId: SID.basic, start: min(0) });
  });

  test("regenerates a stale summary (when the section continued)", async () => {
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

test("API: requesting a summary returns 202 and is pending while in progress", async () => {
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
  release("Login form implementation\n\n- Goal: …");
  expect(await done).toBe(true);
  expect(summaryOf(SID.basic, min(0))?.headline).toBe("Login form implementation");
});

describe("prompt", () => {
  test("parseSummary strips headline decorations", () => {
    expect(parseSummary("# 「API 層の整理」\n\n- 目的: x")).toEqual({
      headline: "API 層の整理",
      body: "- 目的: x",
    });
    expect(parseSummary("Headline: **Login implementation**\n- Outcome: done")).toEqual({
      headline: "Login implementation",
      body: "- Outcome: done",
    });
    expect(parseSummary("見出し: **ログイン実装**\n- 結果: 完了")).toEqual({
      headline: "ログイン実装",
      body: "- 結果: 完了",
    });
    expect(parseSummary("   \n")).toBeNull();
  });

  test("buildDigest keeps the start and the end when too long", () => {
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
    expect(d.startsWith("[User] 最初の依頼")).toBe(true);
    expect(d.endsWith("[User] 最後の依頼")).toBe(true);
    expect(d).toContain("(omitted)");
  });

  test("buildPrompt says so for the first section", () => {
    expect(
      buildPrompt({ sessionTitle: "t", projectName: null, previous: [], digest: "d" }),
    ).toContain("This is the first piece of work in this session.");
  });

  test("summaries are in English by default, in Japanese with lang ja", () => {
    const input = { sessionTitle: "t", projectName: "app", previous: ["x"], digest: "d" };
    const en = buildPrompt(input);
    expect(en).toContain("Write a summary in English");
    expect(en).toContain("- Goal: …");
    expect(en).toContain("- Outcome: …");
    expect(en).toContain("Project: app");
    const ja = buildPrompt(input, "ja");
    expect(ja).toContain("Write a summary in Japanese");
    expect(ja).toContain("15〜35 字、体言止め");
    expect(ja).toContain("- 目的: …");
    expect(ja).toContain("- やったこと: …");
    expect(ja).toContain("- 結果: …");
    expect(buildTitlePrompt(input, "ja")).toContain("single-line headline in Japanese");
    expect(buildTitlePrompt(input)).toContain("3–8 words");
  });
});

test("Summarizer passes its language to the prompt", async () => {
  const ja = new Summarizer(
    db,
    (p) => {
      prompts.push(p);
      return reply(p);
    },
    { now: () => now, lang: "ja" },
  );
  expect(ja.lang).toBe("ja");
  expect(summarizer.lang).toBe("en");
  await ja.summarize({ sessionId: SID.basic, start: min(45) });
  expect(prompts[0]).toContain("Write a summary in Japanese");
});
