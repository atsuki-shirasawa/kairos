import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { openDb } from "../../../src/server/db/index.ts";
import {
  THREAD_LIMIT,
  threadMembers,
  threadSize,
} from "../../../src/server/queries/threadMembers.ts";

/** Sessions with a prompt are shown; the rest stand in for hidden ones. */
const VISIBLE = "s.prompt_count > 0";
const REPO = "github.com/me/app";

let db: Database;
let nextBlock = 1;

beforeEach(() => {
  db = openDb(":memory:");
  nextBlock = 1;
  db.run("INSERT INTO projects (id, path, name) VALUES (1, '/app', 'app'), (2, '/web', 'web')");
});

/** Adds a session, shown unless `hidden`, and returns its id. */
function session(
  id: string,
  opts: { project?: number; branch?: string; continuedIn?: string; hidden?: boolean } = {},
): string {
  db.run(
    `INSERT INTO sessions (id, project_id, branch, continued_in, started_at, prompt_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      opts.project ?? 1,
      opts.branch ?? "main",
      opts.continuedIn ?? null,
      nextBlock,
      opts.hidden ? 0 : 1,
    ],
  );
  return id;
}

/** Adds a block to the session and returns its id. */
function block(sessionId: string): number {
  const id = nextBlock++;
  db.run("INSERT INTO segments (id, session_id, start, end) VALUES (?, ?, ?, ?)", [
    id,
    sessionId,
    id * 100,
    id * 100 + 50,
  ]);
  return id;
}

/** Records that a block of the session touched PR `number`. */
function touch(sessionId: string, number: number, how: string): void {
  db.run("INSERT INTO block_refs (block_id, repo, number, how) VALUES (?, ?, ?, ?)", [
    block(sessionId),
    REPO,
    number,
    how,
  ]);
}

/** Records an item one session left open and another closed. */
function item(openedIn: string, closedIn: string, closedBy: string): void {
  db.run(
    `INSERT INTO open_items (block_id, opened_at, text, closed_at, closed_block_id, closed_by)
     VALUES (?, 0, 'item', 1, ?, ?)`,
    [block(openedIn), block(closedIn), closedBy],
  );
}

const idsOf = (seed: string) => threadMembers(db, VISIBLE, seed)?.ids;

describe("threadMembers", () => {
  test("a continuation ties both ways", () => {
    session("b");
    session("a", { continuedIn: "b" });
    expect(idsOf("a")).toEqual(["a", "b"]);
    expect(threadMembers(db, VISIBLE, "b")?.links).toEqual([
      { sessionId: "a", from: "b", tie: "continued", pr: null, branch: null },
    ]);
  });

  test("opening and merging a PR ties; working on it or naming it doesn't", () => {
    for (const id of ["opener", "merger", "reviewer", "mentioner"]) session(id);
    touch("opener", 12, "opened");
    touch("merger", 12, "merged");
    touch("reviewer", 12, "worked");
    touch("mentioner", 12, "mentioned");
    expect(idsOf("opener")).toEqual(["opener", "merger"]);
    expect(threadMembers(db, VISIBLE, "opener")?.links[0]?.pr).toEqual({
      repo: REPO,
      number: 12,
      url: "https://github.com/me/app/pull/12",
    });
    expect(idsOf("reviewer")).toEqual(["reviewer"]);
  });

  test("a topic branch ties within its project; a trunk branch never does", () => {
    session("a", { branch: "fix/login" });
    session("b", { branch: "fix/login" });
    session("other", { branch: "fix/login", project: 2 });
    session("m1", { branch: "main" });
    session("m2", { branch: "main" });
    expect(idsOf("a")).toEqual(["a", "b"]);
    expect(threadMembers(db, VISIBLE, "a")?.links[0]).toMatchObject({
      tie: "branch",
      branch: "fix/login",
    });
    expect(idsOf("m1")).toEqual(["m1"]);
  });

  test("an item ties the session that left it to the one whose log closed it", () => {
    for (const id of ["left", "closed", "judged", "settled"]) session(id);
    item("left", "closed", "ref");
    item("judged", "settled", "model");
    expect(idsOf("left")).toEqual(["left", "closed"]);
    expect(idsOf("closed")).toEqual(["closed", "left"]);
    expect(idsOf("judged")).toEqual(["judged"]);
  });

  test("ties chain breadth first, each session reached from the member nearest the seed", () => {
    session("a", { branch: "fix/login" });
    session("b", { branch: "fix/login" });
    session("c", { continuedIn: "b" });
    session("d");
    touch("c", 3, "opened");
    touch("d", 3, "merged");
    const members = threadMembers(db, VISIBLE, "a");
    expect(members?.ids).toEqual(["a", "b", "c", "d"]);
    expect(members?.links.map((l) => [l.from, l.sessionId, l.tie])).toEqual([
      ["a", "b", "branch"],
      ["b", "c", "continued"],
      ["c", "d", "pr"],
    ]);
  });

  test("a hidden session neither joins nor ties others in", () => {
    session("a");
    session("hidden", { hidden: true, branch: "fix/x" });
    session("beyond", { branch: "fix/x" });
    touch("a", 5, "opened");
    touch("hidden", 5, "merged");
    expect(idsOf("a")).toEqual(["a"]);
    expect(threadMembers(db, VISIBLE, "hidden")).toBeNull();
    expect(threadSize(db, VISIBLE, "hidden")).toBe(0);
  });

  test("stops at the limit and says so", () => {
    for (let i = 0; i <= THREAD_LIMIT; i++) session(`s${i}`, { branch: "feature/big" });
    const members = threadMembers(db, VISIBLE, "s0");
    expect(members?.ids).toHaveLength(THREAD_LIMIT);
    expect(members?.truncated).toBe(true);
    expect(threadSize(db, VISIBLE, "s1")).toBe(THREAD_LIMIT);
  });

  test("a session tied to nothing is a thread of one", () => {
    session("alone");
    expect(threadMembers(db, VISIBLE, "alone")).toEqual({
      ids: ["alone"],
      links: [],
      truncated: false,
    });
    expect(threadMembers(db, VISIBLE, "missing")).toBeNull();
  });
});
