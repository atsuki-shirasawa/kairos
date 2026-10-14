// Helpers shared by the live page's server tests: appending responses to a fixture log, and the
// calendar's default visibility.
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { SID } from "../../fixtures/ids.ts";
import { min } from "../ingest/helpers.ts";

/** The calendar's default visibility: interactive sessions, no hidden directories. */
export const VISIBLE = { headless: false, hiddenCwds: [] };

/** Appends a text response with `usage` (Claude API field names) to the facts session's log. */
export function appendResponse(
  projectsDir: string,
  n: number,
  usage: Record<string, unknown>,
  model = "claude-opus-5-5",
): void {
  const record = {
    parentUuid: null,
    isSidechain: false,
    type: "assistant",
    message: {
      id: `msg_usage_${n}`,
      type: "message",
      role: "assistant",
      model,
      content: [{ type: "text", text: "Done." }],
      stop_reason: "end_turn",
      usage: { output_tokens: 100, ...usage },
    },
    uuid: `21212121-usage-${n}`,
    timestamp: new Date(min(1700 + n)).toISOString(),
    entrypoint: "cli",
    cwd: "/Users/me/dev/app",
    sessionId: SID.facts,
    version: "2.1.289",
  };
  appendFileSync(
    join(projectsDir, "-Users-me-dev-app", `${SID.facts}.jsonl`),
    `${JSON.stringify(record)}\n`,
  );
}
