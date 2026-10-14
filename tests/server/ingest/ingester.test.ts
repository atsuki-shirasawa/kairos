import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ingester } from "../../../src/server/ingest/ingester.ts";
import { SID } from "../../fixtures/ids.ts";
import { min, noRemotes, setup } from "./helpers.ts";

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

function sdkPrompts(id: string): string[] {
  return db
    .query<{ text: string }, [string]>(
      "SELECT text FROM messages WHERE session_id = ? AND kind = 'sdk_prompt' ORDER BY file_id, seq",
    )
    .all(id)
    .map((r) => r.text);
}

function fallbackTitles(id: string): (string | null)[] {
  return db
    .query<{ fallback_title: string | null }, [string]>(
      "SELECT fallback_title FROM segments WHERE session_id = ? ORDER BY start",
    )
    .all(id)
    .map((r) => r.fallback_title);
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

  test("1. basic: every recap is kept as a note that doesn't stretch the block or session", () => {
    const notes = db
      .query<{ ts: number; text: string }, [string]>(
        "SELECT ts, text FROM messages WHERE session_id = ? AND kind = 'away_summary' ORDER BY ts",
      )
      .all(SID.basic);
    expect(notes).toEqual([
      { ts: min(8), text: "ログインフォームを実装してコミットした。次は PR 作成。" },
      { ts: min(55), text: "ログインフォームを実装して PR #42 を作成した。次はレビュー対応。" },
    ]);
    expect(session(SID.basic).ended_at).toBe(min(50.2));
  });

  test("a long tool result keeps its end, where runners print their totals", () => {
    const path = join(projectsDir, "-Users-me-dev-app", `${SID.basic}.jsonl`);
    const long = `${"line\n".repeat(2000)}12 pass\n3 fail`;
    appendFileSync(
      path,
      `${JSON.stringify({
        type: "user",
        uuid: "long-result",
        sessionId: SID.basic,
        timestamp: new Date(min(5)).toISOString(),
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_x", content: long }],
        },
      })}\n`,
    );
    ingester.scan();
    const text = db
      .query<{ text: string }, []>("SELECT text FROM messages WHERE id = 'long-result:0'")
      .get()?.text;
    expect(text).toStartWith("line\n");
    expect(text).toEndWith("12 pass\n3 fail");
    expect(text).toContain("characters omitted");
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
    expect(
      count(
        "SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND kind = 'away_summary' AND is_scheduled = 0",
        SID.loop,
      ),
    ).toBe(1);
    // Notifications arriving during an automatic run belong to that run's turn
    expect(
      count(
        "SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND kind = 'notification' AND is_scheduled = 1",
        SID.loop,
      ),
    ).toBe(1);
  });

  test("3. headless: zero user prompts, the SDK input titles the session and its block", () => {
    expect(session(SID.headless)).toMatchObject({
      prompt_count: 0,
      title: "Run exactly this one Bash command: echo ok",
    });
    expect(sdkPrompts(SID.headless)).toEqual(["Run exactly this one Bash command: echo ok"]);
    expect(segments(SID.headless)).toEqual([[min(120), min(120.2)]]);
    expect(fallbackTitles(SID.headless)).toEqual(["Run exactly this one Bash command: echo ok"]);
  });

  test("16. sdkCommand: a slash command from the SDK is the SDK input; hook text is not", () => {
    expect(session(SID.sdkCommand)).toMatchObject({
      prompt_count: 0,
      title: "/goal Write the release notes for v2",
    });
    expect(sdkPrompts(SID.sdkCommand)).toEqual(["/goal Write the release notes for v2"]);
    expect(segments(SID.sdkCommand)).toEqual([[min(884), min(886)]]);
  });

  test("17. summarizerRun: stored like any SDK session (hidden by the read queries)", () => {
    expect(session(SID.summarizerRun).prompt_count).toBe(0);
    expect(sdkPrompts(SID.summarizerRun)).toHaveLength(1);
    expect(segments(SID.summarizerRun)).toEqual([[min(890), min(890.2)]]);
  });

  test("18. scratchpadRun: a run in a Claude Code scratchpad joins the project that launched it", () => {
    expect(session(SID.scratchpadRun)).toMatchObject({
      project: "/Users/me/dev/app",
      label: "hookcheck",
    });
  });

  test("19. tempRuns: runs in temporary directories share one tmp project", () => {
    expect(session(SID.tmpRun)).toMatchObject({ project: "/tmp", label: "retry-probe.Qx7Lm2" });
    expect(session(SID.jobRun)).toMatchObject({ project: "/tmp", label: "probe-7" });
    expect(count("SELECT COUNT(*) AS n FROM projects WHERE path = '/tmp' AND name = 'tmp'")).toBe(
      1,
    );
  });

  test("20. containerRuns: a gone directory takes the repository of the PRs opened in it", () => {
    const repo = db
      .query<{ repo: string | null; name: string }, []>(
        "SELECT repo, name FROM projects WHERE path = '/work/checkout'",
      )
      .get();
    expect(repo).toEqual({ repo: "github.com/me/app", name: "app" });
    // The run without a PR is in the same directory, so it goes with it
    for (const id of [SID.containerPr, SID.containerRun])
      expect(session(id)).toMatchObject({ project: "/work/checkout", label: "checkout" });
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

  test("7. compaction: the summary body is kept as a note, outside the work blocks", () => {
    const note = db
      .query<{ ts: number; text: string }, [string]>(
        "SELECT ts, text FROM messages WHERE session_id = ? AND kind = 'compact_summary'",
      )
      .all(SID.compaction);
    expect(note).toEqual([
      {
        ts: min(371),
        text: "This session is being continued from a previous conversation. Summary: 調査を行った。",
      },
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

  test("15. merges: successful gh pr merge calls and gitOperation merges count once each", () => {
    const merges = db
      .query<{ ref: string; ts: number }, [string]>(
        "SELECT ref, ts FROM artifacts WHERE session_id = ? AND kind = 'merge' ORDER BY ts",
      )
      .all(SID.merges);
    expect(merges).toEqual([
      { ref: "#46", ts: min(501) },
      { ref: "#48", ts: min(503) },
      { ref: "#49", ts: min(504.5) },
    ]);
    expect(segments(SID.merges)).toEqual([[min(500), min(505)]]);
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
  const lookup = (dir: string) => remotes[dir] ?? noRemotes(dir);
  const projects = (d: Database) =>
    d.query("SELECT path, name, repo, color FROM projects ORDER BY id").all();
  const resetDerived = () => db.query("DELETE FROM kv WHERE key = 'derived_version'").run();

  test("groups directories with the same remote into one project named after the repository", () => {
    const fresh = setup(lookup);
    fresh.ingester.scan();
    expect(projects(fresh.db)).toEqual([
      // The jobs directory's log folder sorts first, so the shared tmp project is made first
      { path: "/tmp", name: "tmp", repo: null, color: null },
      { path: "/Users/me/dev/app", name: "webapp", repo: "github.com/me/webapp", color: null },
      // Directories without a remote (the SDK scenarios) keep their directory name
      { path: "/Users/me/tmp/probe", name: "probe", repo: null, color: null },
      { path: "/Users/me/tmp/release", name: "release", repo: null, color: null },
      {
        path: "/Users/me/tmp/scratch/kairos-data/summarizer",
        name: "summarizer",
        repo: null,
        color: null,
      },
      // A container checkout, named after the repository of the PR opened in it
      { path: "/work/checkout", name: "app", repo: "github.com/me/app", color: null },
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
    expect(new Ingester(db, projectsDir, { lookupRemote: lookup }).refreshAllIfOutdated()).toBe(
      true,
    );
    // The blog project is now empty, so it is deleted
    expect(projects(db)).toEqual([
      { path: "/tmp", name: "tmp", repo: null, color: null },
      { path: "/Users/me/dev/app", name: "webapp", repo: "github.com/me/webapp", color: "p3" },
      { path: "/Users/me/tmp/probe", name: "probe", repo: null, color: null },
      { path: "/Users/me/tmp/release", name: "release", repo: null, color: null },
      {
        path: "/Users/me/tmp/scratch/kairos-data/summarizer",
        name: "summarizer",
        repo: null,
        color: null,
      },
      // A container checkout, named after the repository of the PR opened in it
      { path: "/work/checkout", name: "app", repo: "github.com/me/app", color: null },
    ]);
    expect(session(SID.blog)).toMatchObject({ project: "/Users/me/dev/app", label: "blog" });
    expect(session(SID.relocated).label).toBe("refactor-api");
  });

  test("keeps sessions whose directory is gone where they are, unless their PRs say otherwise", () => {
    resetDerived();
    new Ingester(db, projectsDir, { lookupRemote: () => undefined }).refreshAllIfOutdated();
    // blog opened no PR, so nothing places it anew
    expect(session(SID.blog).project).toBe("/Users/me/dev/blog");
    // app's PRs and the container's point to the same repository, so they share its project
    expect(session(SID.basic).project).toBe(session(SID.containerPr).project);
  });

  test("a container checkout joins the project of the repository its PRs went to", () => {
    const fresh = setup((dir) =>
      dir === "/Users/me/dev/app" ? "git@github.com:me/app.git" : noRemotes(dir),
    );
    fresh.ingester.scan();
    const place = fresh.db
      .query<{ path: string; label: string | null }, [string]>(
        "SELECT p.path, s.label FROM sessions s JOIN projects p ON p.id = s.project_id WHERE s.id = ?",
      )
      .get(SID.containerRun);
    expect(place).toEqual({ path: "/Users/me/dev/app", label: "checkout" });
  });

  test("a temporary clone placed by its remote stays there once the directory is gone", () => {
    const tmp = "/private/tmp/retry-probe.Qx7Lm2";
    const fresh = setup((dir) => (dir === tmp ? "git@github.com:me/app.git" : noRemotes(dir)));
    fresh.ingester.scan();
    fresh.db.query("DELETE FROM kv WHERE key = 'derived_version'").run();
    const gone = (dir: string) => (dir === tmp ? undefined : noRemotes(dir));
    new Ingester(fresh.db, fresh.projectsDir, { lookupRemote: gone }).refreshAllIfOutdated();
    const repo = fresh.db
      .query<{ repo: string | null }, [string]>(
        "SELECT p.repo FROM sessions s JOIN projects p ON p.id = s.project_id WHERE s.id = ?",
      )
      .get(SID.tmpRun)?.repo;
    expect(repo).toBe("github.com/me/app");
  });

  test("a scratchpad read before its owner's log joins the owner once the scan ends", () => {
    const fresh = setup();
    const pad = fresh.ingester.listFiles().find((f) => f.includes("scratchpad"));
    if (!pad) throw new Error("no scratchpad fixture");
    fresh.ingester.ingestFile(pad);
    const projectOf = () =>
      fresh.db
        .query<{ path: string }, [string]>(
          "SELECT p.path FROM sessions s JOIN projects p ON p.id = s.project_id WHERE s.id = ?",
        )
        .get(SID.scratchpadRun)?.path;
    expect(projectOf()).toBe("/tmp");
    fresh.ingester.scan();
    expect(projectOf()).toBe("/Users/me/dev/app");
  });

  test("a PR from /tmp itself never turns the shared tmp project into a repository", () => {
    db.query("UPDATE sessions SET launch_cwd = '/tmp' WHERE id = ?").run(SID.containerPr);
    resetDerived();
    new Ingester(db, projectsDir, { lookupRemote: noRemotes }).refreshAllIfOutdated();
    expect(db.query("SELECT name, repo FROM projects WHERE path = '/tmp'").get()).toEqual({
      name: "tmp",
      repo: null,
    });
  });

  test("PRs to more than one repository leave a gone directory to its own name", () => {
    const fresh = setup();
    fresh.ingester.scan();
    fresh.db
      .query("UPDATE artifacts SET ref = 'https://github.com/me/other/pull/3' WHERE session_id = ?")
      .run(SID.containerPr);
    fresh.db
      .query(
        "INSERT INTO artifacts (session_id, kind, ref, title, ts, file_id) SELECT ?, 'pr', 'https://github.com/me/app/pull/9', NULL, NULL, file_id FROM artifacts WHERE session_id = ?",
      )
      .run(SID.containerRun, SID.containerPr);
    fresh.db.query("DELETE FROM kv WHERE key = 'derived_version'").run();
    new Ingester(fresh.db, fresh.projectsDir, { lookupRemote: noRemotes }).refreshAllIfOutdated();
    const names = fresh.db
      .query<{ name: string }, []>(
        "SELECT DISTINCT p.name FROM sessions s JOIN projects p ON p.id = s.project_id WHERE s.launch_cwd = '/work/checkout'",
      )
      .all();
    // The earlier assignment is kept rather than replaced by a guess
    expect(names).toEqual([{ name: "app" }]);
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
