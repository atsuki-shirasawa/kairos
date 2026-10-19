import { expect, test } from "bun:test";
import { notificationResult, notificationSummary } from "../../src/shared/notifications.ts";

const notice =
  '<task-notification>\n<summary> Agent "Review" finished </summary>\n<result>No findings.</result>\n</task-notification>';

test("reads a notification's summary and result", () => {
  expect(notificationSummary(notice)).toBe('Agent "Review" finished');
  expect(notificationResult(notice)).toBe("No findings.");
});

test("a result cut short runs to the end; missing parts are null", () => {
  expect(notificationResult("<result>Half a rep")).toBe("Half a rep");
  expect(notificationSummary("# Agent finished")).toBeNull();
  expect(notificationResult("<summary>x</summary>")).toBeNull();
});
