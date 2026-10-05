import { describe, expect, test } from "bun:test";
import { extractCommit } from "../../../src/server/ingest/commits.ts";

describe("extractCommit", () => {
  test("通常の出力から SHA と件名を取る", () => {
    expect(
      extractCommit('git commit -m "feat: x"', "[main 1a2b3c4] feat: x\n 1 file changed"),
    ).toEqual({
      sha: "1a2b3c4",
      subject: "feat: x",
    });
    expect(extractCommit("git commit -m init", "[main (root-commit) abcdef1] init")).toEqual({
      sha: "abcdef1",
      subject: "init",
    });
  });

  test("-q で出力がなくても、-m の件名と git log の行から特定する", () => {
    const cmd = 'git -C /repo commit -q -m "wip: new-since mode" && git log --oneline -3';
    const out = "uv-lock....Skipped\neb6fbfa8 wip: new-since mode\nbd3bf7dd docs: older";
    expect(extractCommit(cmd, out)).toEqual({ sha: "eb6fbfa8", subject: "wip: new-since mode" });
  });

  test("ヒアドキュメントで渡した件名", () => {
    const cmd = `git commit -m "$(cat <<'EOF'\nfeat: add login form\n\nbody\nEOF\n)"`;
    expect(extractCommit(cmd, "")).toEqual({ sha: null, subject: "feat: add login form" });
  });

  test("-am のような結合したフラグ", () => {
    expect(
      extractCommit("git commit -qam 'tmp: parent pin change'", "c25d09eb tmp: parent pin change"),
    ).toEqual({
      sha: "c25d09eb",
      subject: "tmp: parent pin change",
    });
  });

  test("-F で件名が分からなくても、続く git log の先頭を使う", () => {
    const cmd = "git commit -q -F /tmp/msg.txt && git log --oneline -1";
    expect(extractCommit(cmd, "e713683f fix(harness): fail only on new advisories")).toEqual({
      sha: "e713683f",
      subject: "fix(harness): fail only on new advisories",
    });
  });

  test("--amend と、特定できないものは数えない", () => {
    expect(
      extractCommit("git commit -q --amend --no-edit && git log --oneline -1", "d7c4086 x"),
    ).toBeNull();
    expect(extractCommit("git commit -q -F /tmp/msg.txt", "")).toBeNull();
    expect(extractCommit("git status", "[main 1a2b3c4] x")).toBeNull();
  });
});
