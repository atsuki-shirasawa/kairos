import { describe, expect, test } from "bun:test";
import { resumeCommand, shellQuote } from "../../src/web/src/lib/shell.ts";

describe("shellQuote", () => {
  test("leaves plain paths and IDs as they are", () => {
    expect(shellQuote("/Users/me/dev/app")).toBe("/Users/me/dev/app");
    expect(shellQuote("11111111-1111-4111-8111-111111111111")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  test("quotes spaces, metacharacters and single quotes", () => {
    expect(shellQuote("/Users/me/My Projects")).toBe("'/Users/me/My Projects'");
    expect(shellQuote("a;rm -rf ~")).toBe("'a;rm -rf ~'");
    expect(shellQuote("$(touch x)")).toBe("'$(touch x)'");
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
    expect(shellQuote("")).toBe("''");
    expect(shellQuote("=ls")).toBe("'=ls'");
  });
});

describe("resumeCommand", () => {
  test("moves to the session's directory first", () => {
    expect(resumeCommand("abc-1", "/Users/me/dev/app")).toBe(
      "cd -- /Users/me/dev/app && claude --resume abc-1",
    );
  });

  test("without a directory, only resumes", () => {
    expect(resumeCommand("abc-1", null)).toBe("claude --resume abc-1");
  });
});
