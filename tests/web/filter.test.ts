import { describe, expect, test } from "bun:test";
import type { Activity, CalendarSession, Project } from "../../src/shared/api.ts";
import {
  hideSessions,
  isBrief,
  NO_FILTER,
  narrowSessions,
  segmentMatcher,
} from "../../src/web/src/lib/filter.ts";

const NONE: Activity = {
  commits: 0,
  prs: 0,
  filesEdited: 0,
  toolCalls: 0,
  subagents: 0,
  toolErrors: 0,
  interrupts: 0,
  apiErrors: 0,
  compactions: 0,
  claudeMs: null,
  effort: null,
};

function session(
  id: string,
  opts: {
    projectId?: number | null;
    label?: string | null;
    promptCount?: number;
    segments?: { headline: string; activity?: Partial<Activity> }[];
  } = {},
): CalendarSession {
  const segments = (opts.segments ?? [{ headline: id }]).map((g, i) => ({
    start: i * 1000,
    end: i * 1000 + 500,
    headline: g.headline,
    summarized: true,
    promptCount: 1,
    usage: null,
    activity: { ...NONE, ...g.activity },
  }));
  return {
    id,
    projectId: opts.projectId === undefined ? 1 : opts.projectId,
    label: opts.label ?? null,
    title: `${id} のタイトル`,
    startedAt: 0,
    endedAt: segments.length * 1000,
    promptCount: opts.promptCount ?? 5,
    active: false,
    segments,
  };
}

const project = (id: number, name: string, hidden = false): Project => ({
  id,
  path: `/Users/me/dev/${name}`,
  name,
  repo: null,
  color: null,
  hidden,
});
const projects = new Map([
  [1, project(1, "app")],
  [2, project(2, "blog", true)],
]);

describe("isBrief", () => {
  test("発言が少なく、書き換えも成果もないセッションはちょっとした質問", () => {
    expect(isBrief(session("a", { promptCount: 2 }))).toBe(true);
  });

  test("発言が少なくても、ファイルを書き換えていれば残す", () => {
    const s = session("a", {
      promptCount: 1,
      segments: [{ headline: "x" }, { headline: "y", activity: { filesEdited: 3 } }],
    });
    expect(isBrief(s)).toBe(false);
  });

  test("発言が多ければ、書き換えがなくても残す", () => {
    expect(isBrief(session("a", { promptCount: 3 }))).toBe(false);
  });
});

describe("hideSessions", () => {
  const list = [
    session("app"),
    session("blog", { projectId: 2 }),
    session("unknown", { projectId: null }),
    session("brief", { promptCount: 1 }),
  ];

  test("非表示のプロジェクトはいつも除き、プロジェクト不明は残す", () => {
    expect(hideSessions(list, projects, NO_FILTER).map((s) => s.id)).toEqual([
      "app",
      "unknown",
      "brief",
    ]);
  });

  test("ちょっとした質問は、隠すと決めたときだけ除く", () => {
    const shown = hideSessions(list, projects, { ...NO_FILTER, hideBrief: true });
    expect(shown.map((s) => s.id)).toEqual(["app", "unknown"]);
  });
});

describe("segmentMatcher", () => {
  const s = session("a", {
    label: "fix-login",
    segments: [
      { headline: "ログイン画面の修正", activity: { commits: 1 } },
      { headline: "README の更新" },
    ],
  });
  const match = (filter: Partial<typeof NO_FILTER>) => {
    const m = segmentMatcher({ ...NO_FILTER, ...filter }, projects);
    return s.segments.filter((g) => m(s, g)).map((g) => g.headline);
  };

  test("条件がなければすべて合う", () => {
    expect(match({})).toHaveLength(2);
  });

  test("キーワードは見出しを大文字小文字を区別せずに探す", () => {
    expect(match({ q: "readme" })).toEqual(["README の更新"]);
  });

  test("空白で区切った語はすべて含むものだけにする", () => {
    expect(match({ q: "ログイン 修正" })).toEqual(["ログイン画面の修正"]);
    expect(match({ q: "ログイン README" })).toEqual([]);
  });

  test("タイトル・worktree 名・プロジェクト名にもかかる", () => {
    expect(match({ q: "タイトル" })).toHaveLength(2);
    expect(match({ q: "fix-login" })).toHaveLength(2);
    expect(match({ q: "APP" })).toHaveLength(2);
  });

  test("成果ありはコミットか PR のあるブロックだけ", () => {
    expect(match({ outcome: true })).toEqual(["ログイン画面の修正"]);
  });
});

describe("narrowSessions", () => {
  test("合うブロックだけを残し、1 つもないセッションは除く", () => {
    const list = [
      session("a", { segments: [{ headline: "テスト追加" }, { headline: "リリース" }] }),
      session("b", { segments: [{ headline: "調査" }] }),
    ];
    const m = segmentMatcher({ ...NO_FILTER, q: "テスト" }, projects);
    const out = narrowSessions(list, m);
    expect(out.map((s) => s.id)).toEqual(["a"]);
    expect(out[0]?.segments.map((g) => g.headline)).toEqual(["テスト追加"]);
  });

  test("すべて合うセッションはそのまま返す（再描画を増やさない）", () => {
    const list = [session("a")];
    expect(narrowSessions(list, () => true)[0]).toBe(list[0]);
  });
});
