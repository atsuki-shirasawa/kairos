import { expect, test } from "bun:test";
import { formatIngest } from "../../../src/cli/commands/ingest.ts";

test("the ingest summary reads files, rows and the DB's size", () => {
  expect(
    formatIngest(
      { files: 28, changed: 3, ms: 1234 },
      { sessions: 10, onCalendar: 8, messages: 12345, artifacts: 4 },
      { path: "/data/kairos.db", bytes: 3 * 1024 * 1024 },
    ),
  ).toBe(
    [
      "Files 28 (changed 3) in 1.2s",
      "Sessions 10 (on the calendar 8)",
      "Messages 12,345, artifacts 4",
      "DB 3.0 MB (/data/kairos.db)",
    ].join("\n"),
  );
});
