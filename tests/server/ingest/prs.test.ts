import { describe, expect, test } from "bun:test";
import {
  isPrLinkTitle,
  mergedPrNumber,
  mergeRef,
  prCallsIn,
  prLinkTitle,
  prMergeOf,
  prTitleOf,
} from "../../../src/server/ingest/prs.ts";

describe("prTitleOf", () => {
  test("extracts the value of --title, --title= and -t", () => {
    expect(prTitleOf('gh pr create --title "feat: ログイン" --body "x"')).toBe("feat: ログイン");
    expect(prTitleOf("gh pr create --title='fix: 期限' --fill-first")).toBe("fix: 期限");
    expect(prTitleOf("gh pr create -t 'docs: README' -b ''")).toBe("docs: README");
    expect(prTitleOf("gh pr create --title=plain-word")).toBe("plain-word");
  });

  test("resolves escapes and concatenation inside quotes", () => {
    expect(prTitleOf('gh pr create --title "feat: \\"quoted\\" \\$HOME"')).toBe(
      'feat: "quoted" $HOME',
    );
    expect(prTitleOf("gh pr create --title 'it'\\''s'")).toBe("it's");
  });

  test("is not fooled by surrounding commands or a body heredoc", () => {
    expect(
      prTitleOf(
        'cd app && git push && gh pr create --title "feat: A" --body "$(cat <<\'EOF\'\n-t x\nEOF\n)"',
      ),
    ).toBe("feat: A");
    // After && is another command
    expect(prTitleOf("gh pr create --fill && echo --title nope")).toBeNull();
    expect(prTitleOf('echo --title "nope"')).toBeNull();
  });

  test("ignores titles decided at run time", () => {
    expect(prTitleOf('gh pr create --title "$(head -1 t.txt)"')).toBeNull();
    expect(prTitleOf('gh pr create --title "`cat t`"')).toBeNull();
    expect(prTitleOf('gh pr create --title "$TITLE"')).toBeNull();
    expect(prTitleOf("gh pr create --fill")).toBeNull();
  });
});

describe("prMergeOf", () => {
  test("reads the PR number, skipping options and their values", () => {
    expect(prMergeOf("gh pr merge 46 --squash")).toEqual({ number: 46 });
    expect(prMergeOf("gh pr merge --squash --match-head-commit abc123 47")).toEqual({ number: 47 });
    expect(prMergeOf("gh pr merge -R me/app https://github.com/me/app/pull/48")).toEqual({
      number: 48,
    });
  });

  test("finds the merge after other commands and env assignments", () => {
    expect(prMergeOf("gh pr view 49 --json state && gh pr merge 49 --squash")).toEqual({
      number: 49,
    });
    expect(prMergeOf("ACK=1 gh pr merge 50 --squash 2>&1 | tail -3")).toEqual({ number: 50 });
  });

  test("a merge without a number (the current branch's PR, or a branch name) has none", () => {
    expect(prMergeOf("gh pr merge --squash --delete-branch")).toEqual({ number: null });
    expect(prMergeOf("gh pr merge feature/login --squash")).toEqual({ number: null });
  });

  test("mentions inside other commands' arguments are not merges", () => {
    expect(prMergeOf('grep -n "gh pr merge" docs/release.md')).toBeUndefined();
    expect(prMergeOf(`echo '"Bash(gh pr merge *)"' >> settings.json`)).toBeUndefined();
    expect(prMergeOf("gh pr create --title merge")).toBeUndefined();
  });
});

test("prLinkTitle is the stand-in isPrLinkTitle tells from a real title", () => {
  expect(prLinkTitle(42, "me/app")).toBe("#42 me/app");
  expect(prLinkTitle(null, "me/app")).toBe("me/app");
  expect(prLinkTitle(null, null)).toBeNull();
  expect(isPrLinkTitle("#42 me/app", 42, "me/app")).toBe(true);
  expect(isPrLinkTitle("me/app", 42, "me/app")).toBe(true);
  expect(isPrLinkTitle("#42", 42, "me/app")).toBe(true);
  expect(isPrLinkTitle("feat: login", 42, "me/app")).toBe(false);
});

test("mergedPrNumber reads back the number mergeRef stores, and none for a branch merge", () => {
  expect(mergedPrNumber(mergeRef(46, "toolu_1"))).toBe(46);
  expect(mergedPrNumber(mergeRef(null, "toolu_1"))).toBeNull();
});

describe("prCallsIn", () => {
  test("finds each gh pr call's number and --repo, past options and other commands", () => {
    expect(prCallsIn("gh pr view 12 --json state && gh pr checks --watch 13 -R acme/web")).toEqual([
      { number: 12, repo: null },
      { number: 13, repo: "acme/web" },
    ]);
    expect(prCallsIn("gh --repo=acme/web pr diff 4")).toEqual([{ number: 4, repo: "acme/web" }]);
  });

  test("names nothing for a call by branch, a body that holds a number, or a mention", () => {
    expect(prCallsIn("gh pr create --fill && gh pr view feat/x")).toEqual([]);
    expect(prCallsIn("gh pr list --limit 60 && gh pr view --json number 61")).toEqual([
      { number: 61, repo: null },
    ]);
    expect(prCallsIn('gh pr comment --body "12" 9')).toEqual([{ number: 9, repo: null }]);
    expect(prCallsIn('grep "gh pr view 12" notes.md')).toEqual([]);
  });
});
