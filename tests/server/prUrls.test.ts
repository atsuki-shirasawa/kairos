import { expect, test } from "bun:test";
import { prOfUrl, prUrl } from "../../src/server/prUrls.ts";

test("prOfUrl reads a PR URL's repository key, owner/name and number", () => {
  expect(prOfUrl("https://github.com/acme/web/pull/12")).toEqual({
    repo: "github.com/acme/web",
    number: 12,
    fullName: "acme/web",
  });
  expect(prOfUrl("https://github.com/acme/web/issues/12")).toBeNull();
});

test("prOfUrl reads back what prUrl builds", () => {
  const ref = { repo: "github.com/acme/web", number: 7 };
  expect(prOfUrl(prUrl(ref))).toMatchObject(ref);
});
