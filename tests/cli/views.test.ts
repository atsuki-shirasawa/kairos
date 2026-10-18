import { expect, test } from "bun:test";
import { renderOpenItems, renderSearch } from "../../src/cli/views.ts";
import type { LedgerEntry, Project, SearchHit } from "../../src/shared/api.ts";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

const projects = new Map<number, Project>([
  [1, { id: 1, path: "/r/kairos", name: "kairos", repo: null, color: null, hidden: false }],
  [2, { id: 2, path: "/r/secret", name: "secret", repo: null, color: null, hidden: true }],
]);

function item(id: number, projectId: number | null, text: string, extra = {}): LedgerEntry {
  return {
    id,
    projectId,
    kind: "todo",
    text,
    sessionId: "s1",
    start: at(12, 9),
    openedAt: at(12, 10),
    closedAt: null,
    closedBy: null,
    closedSessionId: null,
    closedStart: null,
    closedNote: null,
    ...extra,
  };
}

test("open items are grouped by project", () => {
  const text = renderOpenItems(
    [item(1, 1, "Write\ndocs"), item(2, null, "Loose"), item(3, 1, "Ask", { kind: null })],
    projects,
  );
  expect(text).toBe(
    "## kairos\n\n- [todo] Write docs (left open 2026-10-12)\n- Ask (left open 2026-10-12)\n\n" +
      "## (no project)\n\n- [todo] Loose (left open 2026-10-12)",
  );
  expect(renderOpenItems([], projects)).toBe("No open items.");
});

test("search hits link to their block in the day view", () => {
  const hit: SearchHit = {
    sessionId: "s1",
    projectId: 1,
    label: null,
    start: at(12, 9),
    end: at(12, 10),
    headline: "Add the CLI",
    field: "prompt",
    snippet: "…the cli…",
  };
  const text = renderSearch([hit], true, projects, "http://127.0.0.1:4319/");
  expect(text).toContain("2026-10-12 09:00  kairos  Add the CLI\n  prompt: …the cli…\n");
  expect(text).toContain(`/journal/2026-10-12?view=day&session=s1&at=${at(12, 9)}`);
  expect(text).toEndWith("raise --limit.");
  expect(renderSearch([], false, projects, "")).toBe("No matches.");
});
