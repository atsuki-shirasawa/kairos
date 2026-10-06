import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { classifyPath, Ingester } from "../../../src/server/ingest/ingester.ts";
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

describe("README scenarios", () => {
  test("1. basic: title, work blocks, artifacts, recap", () => {
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

  test("1. basic: thinking is not stored; tool calls keep a name and summary", () => {
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

  test("2. loop: automatic runs are counted but not drawn as work blocks", () => {
    expect(session(SID.loop)).toMatchObject({ prompt_count: 2, scheduled_runs: 4 });
    expect(segments(SID.loop)).toEqual([
      [min(0), min(1)],
      [min(150), min(151)],
    ]);
    // Notifications arriving during an automatic run belong to that run's turn
    expect(
      count(
        "SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND kind = 'notification' AND is_scheduled = 1",
        SID.loop,
      ),
    ).toBe(1);
  });

  test("3. headless: zero user prompts", () => {
    expect(session(SID.headless).prompt_count).toBe(0);
  });

  test("4. started in a worktree: grouped under the parent repository with a label", () => {
    expect(session(SID.worktree)).toMatchObject({
      project: "/Users/me/dev/app",
      label: "fix-header",
    });
    expect(segments(SID.worktree)).toEqual([[min(200), min(202)]]);
  });

  test("5. moved into a worktree midway: project from the startup cwd, label from the destination", () => {
    expect(session(SID.relocated)).toMatchObject({
      project: "/Users/me/dev/app",
      label: "refactor-api",
    });
    expect(segments(SID.relocated)).toEqual([[min(240), min(243)]]);
  });

  test("6. subagents: ingests metadata and conversation without mixing them into the parent's work blocks", () => {
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

  test("7. compaction: /compact counts as a prompt; the summary and command output do not", () => {
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

  test("8. continued session: excludes copies of and duplicates from the previous session", () => {
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

  test("8. continued session: same result when the continuation is ingested first", () => {
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

  test("9. partial line: ingests only complete lines; offset points at the start of the cut line", () => {
    expect(count("SELECT COUNT(*) AS n FROM messages WHERE session_id = ?", SID.partial)).toBe(2);
    const st = db
      .query<{ offset: number; size: number }, [string]>(
        "SELECT offset, size FROM ingest_state WHERE session_id = ?",
      )
      .get(SID.partial);
    expect(st && st.size - st.offset).toBe(60);
  });

  test("11. PR title: attaches the gh pr create title, keeping it whether pr-link comes before or after", () => {
    const prs = db
      .query<{ ref: string; title: string | null }, [string]>(
        "SELECT ref, title FROM artifacts WHERE session_id = ? AND kind = 'pr' ORDER BY ref",
      )
      .all(SID.prTitles);
    expect(prs).toEqual([
      { ref: "https://github.com/me/app/pull/43", title: "feat: パスワード再設定メールを送る" },
      { ref: "https://github.com/me/app/pull/44", title: "fix: リンクの有効期限を 30 分にする" },
      // Titles decided at run time are not used; fall back to the pr-link number and repository
      { ref: "https://github.com/me/app/pull/45", title: "#45 me/app" },
    ]);
    expect(segments(SID.prTitles)).toEqual([[min(540), min(546)]]);
  });

  test("12. usage: split responses become one per message.id, output is the max, synthetic records are not counted", () => {
    const rows = db
      .query<Record<string, unknown>, [string]>(
        `SELECT model, input, output, cache_read, cache_write_5m, cache_write_1h FROM usage
         WHERE session_id = ? ORDER BY ts`,
      )
      .all(SID.usage);
    expect(rows).toEqual([
      {
        model: "claude-opus-5-5",
        input: 2_000,
        output: 900,
        cache_read: 30_000,
        cache_write_5m: 0,
        cache_write_1h: 8_000,
      },
      {
        model: "claude-sonnet-5-5",
        input: 500,
        output: 300,
        cache_read: 40_000,
        cache_write_5m: 1_000,
        cache_write_1h: 0,
      },
    ]);
  });

  test("14. iterations: usage sums every step, including compaction left out of the top-level fields", () => {
    const rows = db
      .query<Record<string, unknown>, [string]>(
        `SELECT input, output, cache_read, cache_write_5m, cache_write_1h FROM usage
         WHERE session_id = ? ORDER BY ts`,
      )
      .all(SID.iterations);
    expect(rows).toEqual([
      { input: 3, output: 1_200, cache_read: 50_000, cache_write_5m: 0, cache_write_1h: 2_000 },
      { input: 150_004, output: 3_400, cache_read: 0, cache_write_5m: 0, cache_write_1h: 20_000 },
    ]);
  });

  test("8. continued session: copied responses from the previous session do not count as tokens", () => {
    const own = (id: string) =>
      count(
        "SELECT COALESCE(SUM(input + output + cache_read + cache_write_5m + cache_write_1h), 0) AS n FROM usage WHERE session_id = ? AND is_copy = 0",
        id,
      );
    // cache_creation_input_tokens without a breakdown count as 5-minute writes
    expect(own(SID.continuedFrom)).toBe(24_800);
    expect(own(SID.continuedTo)).toBe(24_800);
  });

  test("12. usage: records effort per response and turn durations on the main session", () => {
    expect(
      db
        .query<{ effort: string }, [string]>(
          "SELECT effort FROM usage WHERE session_id = ? ORDER BY ts",
        )
        .all(SID.usage)
        .map((r) => r.effort),
    ).toEqual(["high", "medium"]);
    expect(
      db
        .query<{ ts: number; duration_ms: number }, [string]>(
          "SELECT ts, duration_ms FROM turns WHERE session_id = ?",
        )
        .all(SID.usage),
    ).toEqual([{ ts: min(603), duration_ms: 170_000 }]);
  });

  test("8. continued session: durations of copied turns are not counted", () => {
    const own = (id: string) =>
      count(
        "SELECT COALESCE(SUM(duration_ms), 0) AS n FROM turns WHERE session_id = ? AND is_copy = 0",
        id,
      );
    expect(own(SID.continuedFrom)).toBe(30_000);
    expect(own(SID.continuedTo)).toBe(30_000);
  });

  test("13. fragments: prompt-less blocks are drawn only when Claude used tools", () => {
    expect(session(SID.fragments).prompt_count).toBe(1);
    expect(segments(SID.fragments)).toEqual([
      [min(660), min(662)],
      [min(760), min(765)],
    ]);
    expect(
      count(
        "SELECT COUNT(*) AS n FROM artifacts WHERE session_id = ? AND kind = 'commit'",
        SID.fragments,
      ),
    ).toBe(1);
  });

  test("10. another project, next day", () => {
    const s = session(SID.blog);
    expect(s.project).toBe("/Users/me/dev/blog");
    expect(new Date(s.started_at ?? 0).toISOString()).toBe("2026-09-29T01:00:00.000Z");
  });
});

describe("project identity (git remote)", () => {
  // Suppose app and blog are different clones of the same repository
  const remotes: Record<string, string> = {
    "/Users/me/dev/app": "git@github.com:me/webapp.git",
    "/Users/me/dev/blog": "https://github.com/me/webapp.git",
  };
  const lookup = (dir: string) => remotes[dir] ?? null;
  const projects = (d: Database) =>
    d.query("SELECT path, name, repo, color FROM projects ORDER BY id").all();
  const resetDerived = () => db.query("DELETE FROM kv WHERE key = 'derived_version'").run();

  test("groups directories with the same remote into one project named after the repository", () => {
    const fresh = setup(lookup);
    fresh.ingester.scan();
    expect(projects(fresh.db)).toEqual([
      { path: "/Users/me/dev/app", name: "webapp", repo: "github.com/me/webapp", color: null },
      // A directory without a remote (the headless scenario) keeps its directory name
      { path: "/Users/me/tmp/probe", name: "probe", repo: null, color: null },
    ]);
    const label = (id: string) =>
      fresh.db
        .query<{ label: string | null }, [string]>("SELECT label FROM sessions WHERE id = ?")
        .get(id)?.label;
    // The directory name differs from the repository name, so the label tells which clone
    expect(label(SID.basic)).toBe("app");
    expect(label(SID.blog)).toBe("blog");
    // A worktree, or a worktree name in the log, takes precedence
    expect(label(SID.worktree)).toBe("fix-header");
    expect(label(SID.relocated)).toBe("refactor-api");
  });

  test("when the rules change, reassigns existing sessions, keeps colors and deletes empty projects", () => {
    db.query("UPDATE projects SET color = 'p3' WHERE path = '/Users/me/dev/app'").run();
    resetDerived();
    expect(new Ingester(db, projectsDir, undefined, lookup).refreshAllIfOutdated()).toBe(true);
    // The blog project is now empty, so it is deleted
    expect(projects(db)).toEqual([
      { path: "/Users/me/dev/app", name: "webapp", repo: "github.com/me/webapp", color: "p3" },
      { path: "/Users/me/tmp/probe", name: "probe", repo: null, color: null },
    ]);
    expect(session(SID.blog)).toMatchObject({ project: "/Users/me/dev/app", label: "blog" });
    expect(session(SID.relocated).label).toBe("refactor-api");
  });

  test("does not reassign sessions whose directory is gone", () => {
    resetDerived();
    new Ingester(db, projectsDir, undefined, () => undefined).refreshAllIfOutdated();
    expect(projects(db)).toHaveLength(3);
    expect(session(SID.blog).project).toBe("/Users/me/dev/blog");
  });
});

describe("incremental ingest", () => {
  test("the second run does nothing without changes", () => {
    const before = count("SELECT COUNT(*) AS n FROM messages");
    const stats = ingester.scan();
    expect(stats.changed).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM messages")).toBe(before);
  });

  test("resumes from a partial line once it is complete", () => {
    const dir = join(projectsDir, "-Users-me-dev-app");
    const file = join(dir, readdirSync(dir).find((f) => f.startsWith(SID.partial)) ?? "");
    const rest = `${JSON.stringify({ type: "assistant", uuid: "half-written", timestamp: "2026-09-28T08:02:00.000Z", message: { content: [{ type: "text", text: "書きかけ" }] } }).slice(60)}\n`;
    appendFileSync(file, rest);
    expect(ingester.ingestFile(file)).toEqual([SID.partial]);
    expect(count("SELECT COUNT(*) AS n FROM messages WHERE session_id = ?", SID.partial)).toBe(3);
    expect(session(SID.partial).ended_at).toBe(min(482));
  });

  test("carries automatic-run state across reads of a file", () => {
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

  test("re-imports a file's data when the file is replaced", () => {
    const file = join(projectsDir, "-Users-me-dev-blog", `${SID.blog}.jsonl`);
    writeFileSync(
      file,
      `${JSON.stringify({ type: "user", uuid: "new", sessionId: SID.blog, cwd: "/Users/me/dev/blog", timestamp: "2026-09-30T00:00:00.000Z", origin: { kind: "human" }, message: { role: "user", content: "やり直し" } })}\n`,
    );
    ingester.ingestFile(file);
    expect(count("SELECT COUNT(*) AS n FROM messages WHERE session_id = ?", SID.blog)).toBe(1);
    expect(session(SID.blog).title).toBe("やり直し");
  });

  test("DB data stays when the source log is deleted", () => {
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
