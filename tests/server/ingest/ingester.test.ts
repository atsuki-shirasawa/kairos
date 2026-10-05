import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { classifyPath, type Ingester } from "../../../src/server/ingest/ingester.ts";
import { SID } from "../../fixtures/ids.ts";
import { min, setup } from "./helpers.ts";

let db: Database;
let ingester: Ingester;
let projectsDir: string;

beforeEach(() => {
  ({ db, ingester, projectsDir } = setup());
  ingester.scan();
});

interface SessionRow {
  project: string | null;
  label: string | null;
  title: string | null;
  prompt_count: number;
  scheduled_runs: number;
  away_summary: string | null;
  continued_in: string | null;
  started_at: number | null;
  ended_at: number | null;
}

function session(id: string): SessionRow {
  const row = db
    .query<SessionRow, [string]>(
      `SELECT p.path AS project, s.label, COALESCE(s.custom_title, s.agent_name, s.ai_title, s.first_prompt) AS title,
              s.prompt_count, s.scheduled_runs, s.away_summary, s.continued_in, s.started_at, s.ended_at
       FROM sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ?`,
    )
    .get(id);
  if (!row) throw new Error(`session not found: ${id}`);
  return row;
}

function segments(id: string): [number, number][] {
  return db
    .query<{ start: number; end: number }, [string]>(
      "SELECT start, end FROM segments WHERE session_id = ? ORDER BY start",
    )
    .all(id)
    .map((r) => [r.start, r.end]);
}

function count(sql: string, ...params: string[]): number {
  return db.query<{ n: number }, string[]>(sql).get(...params)?.n ?? 0;
}

describe("README のシナリオ", () => {
  test("1. basic: タイトル・作業ブロック・成果物・振り返り文", () => {
    const s = session(SID.basic);
    expect(s).toMatchObject({
      project: "/Users/me/dev/app",
      title: "ログイン機能",
      prompt_count: 3,
      scheduled_runs: 0,
    });
    expect(s.away_summary).toBe("ログインフォームを実装して PR #42 を作成した。次はレビュー対応。");
    expect(segments(SID.basic)).toEqual([
      [min(0), min(5)],
      [min(45), min(50.2)],
    ]);
    const artifacts = db
      .query("SELECT kind, ref, title FROM artifacts WHERE session_id = ? ORDER BY kind")
      .all(SID.basic);
    expect(artifacts).toEqual([
      { kind: "commit", ref: "1a2b3c4", title: "feat: add login form" },
      { kind: "commit", ref: "9f8e7d6", title: "fix: validate email" },
      { kind: "pr", ref: "https://github.com/me/app/pull/42", title: "#42 me/app" },
    ]);
  });

  test("1. basic: thinking は保存せず、ツール呼び出しは名前と要約を持つ", () => {
    expect(
      count(
        "SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND text LIKE '%既存のフォーム部品%'",
        SID.basic,
      ),
    ).toBe(0);
    const tool = db
      .query<{ tool_name: string; text: string }, [string]>(
        "SELECT tool_name, text FROM messages WHERE session_id = ? AND kind = 'tool_use' ORDER BY seq LIMIT 1",
      )
      .get(SID.basic);
    expect(tool).toEqual({ tool_name: "Bash", text: "ls src/components" });
  });

  test("2. loop: 自動実行は数えるが、作業ブロックには描かない", () => {
    expect(session(SID.loop)).toMatchObject({ prompt_count: 2, scheduled_runs: 4 });
    expect(segments(SID.loop)).toEqual([
      [min(0), min(1)],
      [min(150), min(151)],
    ]);
    // 自動実行中に届いた通知も自動実行のターンに含める
    expect(
      count(
        "SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND kind = 'notification' AND is_scheduled = 1",
        SID.loop,
      ),
    ).toBe(1);
  });

  test("3. headless: 人の発言が 0 件", () => {
    expect(session(SID.headless).prompt_count).toBe(0);
  });

  test("4. worktree で起動: 親リポジトリにまとめてラベルを付ける", () => {
    expect(session(SID.worktree)).toMatchObject({
      project: "/Users/me/dev/app",
      label: "fix-header",
    });
    expect(segments(SID.worktree)).toEqual([[min(200), min(202)]]);
  });

  test("5. 途中で worktree に移動: プロジェクトは起動時の cwd、ラベルは移動先", () => {
    expect(session(SID.relocated)).toMatchObject({
      project: "/Users/me/dev/app",
      label: "refactor-api",
    });
    expect(segments(SID.relocated)).toEqual([[min(240), min(243)]]);
  });

  test("6. サブエージェント: メタ情報と会話を取り込み、親の作業ブロックには混ぜない", () => {
    const sub = db
      .query("SELECT id, agent_type, description, tool_use_id FROM subagents WHERE session_id = ?")
      .all(SID.subagent);
    expect(sub).toEqual([
      {
        id: "a1b2c3d4e5f60718",
        agent_type: "code-reviewer",
        description: "PR #42 のレビュー",
        tool_use_id: "toolu_6666660001",
      },
    ]);
    expect(
      count(
        "SELECT COUNT(*) AS n FROM messages WHERE agent_id = 'a1b2c3d4e5f60718' AND kind = 'prompt'",
      ),
    ).toBe(1);
    expect(session(SID.subagent).prompt_count).toBe(1);
    expect(segments(SID.subagent)).toEqual([[min(300), min(305.5)]]);
  });

  test("7. compaction: /compact は発言に数え、要約とコマンド出力は数えない", () => {
    expect(session(SID.compaction).prompt_count).toBe(3);
    expect(
      count(
        "SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND kind = 'compact'",
        SID.compaction,
      ),
    ).toBe(1);
    expect(segments(SID.compaction)).toEqual([
      [min(360), min(362)],
      [min(380), min(383)],
    ]);
  });

  test("8. 続きのセッション: 前のセッションのコピーと重複を除く", () => {
    expect(session(SID.continuedFrom)).toMatchObject({
      prompt_count: 1,
      continued_in: SID.continuedTo,
    });
    expect(session(SID.continuedTo).prompt_count).toBe(1);
    expect(session(SID.continuedTo).title).toBe("後半の作業");
    expect(segments(SID.continuedTo)).toEqual([[min(425), min(426)]]);
    expect(
      count(
        "SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND is_copy = 1",
        SID.continuedTo,
      ),
    ).toBe(2);
  });

  test("8. 続きのセッション: 続き側を先に取り込んでも結果は同じ", () => {
    const fresh = setup();
    const dir = join(fresh.projectsDir, "-Users-me-dev-app");
    expect(fresh.ingester.ingestFile(join(dir, `${SID.continuedTo}.jsonl`))).toEqual([
      SID.continuedTo,
    ]);
    expect(fresh.ingester.ingestFile(join(dir, `${SID.continuedFrom}.jsonl`))).toEqual([
      SID.continuedFrom,
      SID.continuedTo,
    ]);
    const prompts = (id: string) =>
      fresh.db
        .query<{ n: number }, [string]>("SELECT prompt_count AS n FROM sessions WHERE id = ?")
        .get(id)?.n;
    expect(prompts(SID.continuedFrom)).toBe(1);
    expect(prompts(SID.continuedTo)).toBe(1);
  });

  test("9. 書きかけの行: 完全な行だけ取り込み、offset は途切れた行の先頭", () => {
    expect(count("SELECT COUNT(*) AS n FROM messages WHERE session_id = ?", SID.partial)).toBe(2);
    const st = db
      .query<{ offset: number; size: number }, [string]>(
        "SELECT offset, size FROM ingest_state WHERE session_id = ?",
      )
      .get(SID.partial);
    expect(st && st.size - st.offset).toBe(60);
  });

  test("10. 別プロジェクト・翌日", () => {
    const s = session(SID.blog);
    expect(s.project).toBe("/Users/me/dev/blog");
    expect(new Date(s.started_at ?? 0).toISOString()).toBe("2026-09-29T01:00:00.000Z");
  });
});

describe("差分取り込み", () => {
  test("変更がなければ 2 回目は何もしない", () => {
    const before = count("SELECT COUNT(*) AS n FROM messages");
    const stats = ingester.scan();
    expect(stats.changed).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM messages")).toBe(before);
  });

  test("書きかけの行が書き終わったら、その行から続きを読む", () => {
    const dir = join(projectsDir, "-Users-me-dev-app");
    const file = join(dir, readdirSync(dir).find((f) => f.startsWith(SID.partial)) ?? "");
    const rest = `${JSON.stringify({ type: "assistant", uuid: "half-written", timestamp: "2026-09-28T08:02:00.000Z", message: { content: [{ type: "text", text: "書きかけ" }] } }).slice(60)}\n`;
    appendFileSync(file, rest);
    expect(ingester.ingestFile(file)).toEqual([SID.partial]);
    expect(count("SELECT COUNT(*) AS n FROM messages WHERE session_id = ?", SID.partial)).toBe(3);
    expect(session(SID.partial).ended_at).toBe(min(482));
  });

  test("自動実行の状態はファイルの読み込みをまたいで引き継ぐ", () => {
    const dir = join(projectsDir, "-Users-me-dev-app");
    const file = join(dir, `${SID.loop}.jsonl`);
    const base = { sessionId: SID.loop, cwd: "/Users/me/dev/app" };
    appendFileSync(
      file,
      `${JSON.stringify({ ...base, type: "user", uuid: "t5", timestamp: "2026-09-28T03:00:00.000Z", isMeta: true, turnOrigin: "scheduled", message: { role: "user", content: "# tick" } })}\n`,
    );
    ingester.ingestFile(file);
    appendFileSync(
      file,
      `${JSON.stringify({ ...base, type: "assistant", uuid: "t5a", timestamp: "2026-09-28T03:01:00.000Z", message: { model: "m", content: [{ type: "text", text: "ok" }] } })}\n`,
    );
    ingester.ingestFile(file);
    expect(
      count("SELECT COUNT(*) AS n FROM messages WHERE id = 't5a:0' AND is_scheduled = 1"),
    ).toBe(1);
    expect(segments(SID.loop)).toHaveLength(2);
  });

  test("ファイルが置き換えられたら、そのファイル由来のデータを入れ直す", () => {
    const file = join(projectsDir, "-Users-me-dev-blog", `${SID.blog}.jsonl`);
    writeFileSync(
      file,
      `${JSON.stringify({ type: "user", uuid: "new", sessionId: SID.blog, cwd: "/Users/me/dev/blog", timestamp: "2026-09-30T00:00:00.000Z", origin: { kind: "human" }, message: { role: "user", content: "やり直し" } })}\n`,
    );
    ingester.ingestFile(file);
    expect(count("SELECT COUNT(*) AS n FROM messages WHERE session_id = ?", SID.blog)).toBe(1);
    expect(session(SID.blog).title).toBe("やり直し");
  });

  test("元ログが消えても DB のデータは残る", () => {
    const before = count("SELECT COUNT(*) AS n FROM messages WHERE session_id = ?", SID.blog);
    rmSync(join(projectsDir, "-Users-me-dev-blog"), { recursive: true });
    ingester.scan();
    expect(count("SELECT COUNT(*) AS n FROM messages WHERE session_id = ?", SID.blog)).toBe(before);
    expect(session(SID.blog).prompt_count).toBe(1);
  });
});

test("classifyPath", () => {
  const p = "/x/projects";
  expect(classifyPath(p, `${p}/-a/s1.jsonl`)).toEqual({ kind: "session", sessionId: "s1" });
  expect(classifyPath(p, `${p}/-a/s1/subagents/agent-ab12.jsonl`)).toEqual({
    kind: "subagent",
    sessionId: "s1",
    agentId: "ab12",
  });
  expect(classifyPath(p, `${p}/-a/s1/subagents/agent-ab12.meta.json`)).toEqual({
    kind: "subagent-meta",
    sessionId: "s1",
    agentId: "ab12",
  });
  expect(classifyPath(p, `${p}/-a/memory/notes.md`)).toBeNull();
});
