import { describe, expect, test } from "bun:test";
import { prTitleOf } from "../../../src/server/ingest/prs.ts";

describe("prTitleOf", () => {
  test("--title・--title=・-t の値を取り出す", () => {
    expect(prTitleOf('gh pr create --title "feat: ログイン" --body "x"')).toBe("feat: ログイン");
    expect(prTitleOf("gh pr create --title='fix: 期限' --fill-first")).toBe("fix: 期限");
    expect(prTitleOf("gh pr create -t 'docs: README' -b ''")).toBe("docs: README");
    expect(prTitleOf("gh pr create --title=plain-word")).toBe("plain-word");
  });

  test("引用符の中のエスケープと連結を解く", () => {
    expect(prTitleOf('gh pr create --title "feat: \\"quoted\\" \\$HOME"')).toBe(
      'feat: "quoted" $HOME',
    );
    expect(prTitleOf("gh pr create --title 'it'\\''s'")).toBe("it's");
  });

  test("前後のコマンドや本文のヒアドキュメントに惑わされない", () => {
    expect(
      prTitleOf(
        'cd app && git push && gh pr create --title "feat: A" --body "$(cat <<\'EOF\'\n-t x\nEOF\n)"',
      ),
    ).toBe("feat: A");
    // && の後ろは別のコマンド
    expect(prTitleOf("gh pr create --fill && echo --title nope")).toBeNull();
    expect(prTitleOf('echo --title "nope"')).toBeNull();
  });

  test("実行時に決まる題名は使わない", () => {
    expect(prTitleOf('gh pr create --title "$(head -1 t.txt)"')).toBeNull();
    expect(prTitleOf('gh pr create --title "`cat t`"')).toBeNull();
    expect(prTitleOf('gh pr create --title "$TITLE"')).toBeNull();
    expect(prTitleOf("gh pr create --fill")).toBeNull();
  });
});
