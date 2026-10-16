import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { createApp } from "../../src/server/api/app.ts";
import { EventHub } from "../../src/server/events.ts";
import { loadRecapInput, recapHash } from "../../src/server/summarize/recap.ts";
import { buildRecapPrompt } from "../../src/server/summarize/recapPrompt.ts";
import { Summarizer } from "../../src/server/summarize/summarizer.ts";
import type { LedgerEntry, OpenItemsResponse, SessionDetail } from "../../src/shared/api.ts";
import { SID } from "../fixtures/ids.ts";
import { markdownRunner } from "./answers.ts";
import { min, setup } from "./ingest/helpers.ts";

/** What the first section of the ledger scenario leaves open, as the model would write it. */
const OPENING = `CSV export garbled in Excel

- Goal: find why the CSV export is garbled in Excel
- Done: filed issue #21 and task #1
- Open:
  - [issue] The CSV export is garbled in Excel (#21)
  - [todo] Add a BOM to the CSV export
  - [question] Whether to offer UTF-16 output too
  - [waiting] Design review of the export dialog`;

const URL_BASE = "http://127.0.0.1:4319";
/** The ledger scenario's day, wide enough for both of its sessions. */
const FROM = min(1440);
const TO = min(2880);

let db: Database;
let app: Hono;
let now: number;
let summarizer: Summarizer;
let replies: Map<string, string>;

beforeEach(async () => {
  const s = setup();
  s.ingester.scan();
  db = s.db;
  now = min(10_000);
  replies = new Map([["[User] CSV エクスポート", OPENING]]);
  summarizer = new Summarizer(
    db,
    markdownRunner(async (p) => {
      for (const [phrase, reply] of replies) if (p.includes(phrase)) return reply;
      return "Some work\n\n- Goal: work\n- Done: worked";
    }),
    { now: () => now, model: "test-model", quiet: true },
  );
  app = createApp({ db, events: new EventHub(), now: () => now });
  await summarizer.summarize({ sessionId: SID.ledgerOpen, start: min(1700), mode: "summary" });
});

const get = async <T>(path: string) => (await app.request(`${URL_BASE}${path}`)).json() as T;
const patch = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(`${URL_BASE}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const items = async (from = FROM, to = TO) =>
  (await get<OpenItemsResponse>(`/api/open-items?from=${from}&to=${to}`)).items;
const idOf = async (prefix: string) =>
  (await items()).find((i) => i.text.startsWith(prefix))?.id ?? -1;

describe("GET /api/open-items", () => {
  test("lists the period's items with how and where each was closed", async () => {
    const list = await items();
    expect(list.map((i) => [i.kind, i.closedBy])).toEqual([
      ["issue", "ref"],
      ["todo", "ref"],
      ["question", null],
      ["waiting", null],
    ]);
    expect(list[0]).toMatchObject({
      sessionId: SID.ledgerOpen,
      start: min(1700),
      openedAt: min(1712),
      closedSessionId: SID.ledgerClose,
      closedStart: min(1800),
      closedNote: "closed #21",
    });
  });

  test("leaves out items left open after the period or closed before it", async () => {
    expect(await items(FROM, min(1700))).toEqual([]);
    // From 1750 on, the task (closed at 1740) is settled; the rest were still open
    expect((await items(min(1750), TO)).map((i) => i.kind)).toEqual([
      "issue",
      "question",
      "waiting",
    ]);
  });

  test("refuses a missing or reversed range", async () => {
    expect((await app.request(`${URL_BASE}/api/open-items?from=5&to=1`)).status).toBe(400);
  });
});

describe("PATCH /api/open-items/:id", () => {
  test("closes an open item by hand as done or dismissed, and reopens it", async () => {
    const question = await idOf("Whether");
    const done = await patch(`/api/open-items/${question}`, { state: "done" });
    expect(done.status).toBe(200);
    expect(await done.json()).toMatchObject({ closedBy: "user", closedAt: now, closedStart: null });
    const reopened = (await (
      await patch(`/api/open-items/${question}`, { state: "open" })
    ).json()) as LedgerEntry;
    expect(reopened).toMatchObject({ closedBy: null, closedAt: null });
    const waiting = await idOf("Design review");
    expect(
      await (await patch(`/api/open-items/${waiting}`, { state: "dismissed" })).json(),
    ).toMatchObject({ closedBy: "dismissed" });
  });

  test("marks an item the summary listed by mistake, which only a hand edit undoes", async () => {
    const question = await idOf("Whether");
    const mistaken = await patch(`/api/open-items/${question}`, { state: "mistaken" });
    expect(await mistaken.json()).toMatchObject({ closedBy: "mistaken", closedAt: now });
    expect((await patch(`/api/open-items/${question}`, { state: "open" })).status).toBe(200);
  });

  test("logs every hand edit with a copy of its item, undos included", async () => {
    const question = await idOf("Whether");
    await patch(`/api/open-items/${question}`, { state: "mistaken" });
    now += 1;
    await patch(`/api/open-items/${question}`, { state: "open" });
    now += 1;
    await patch(`/api/open-items/${question}`, { state: "done" });
    const log = db
      .query<{ item_id: number; kind: string; text: string; state: string; at: number }, []>(
        "SELECT item_id, kind, text, state, at FROM open_item_decisions ORDER BY id",
      )
      .all();
    expect(log.map((d) => [d.item_id, d.state, d.at])).toEqual([
      [question, "mistaken", now - 2],
      [question, "open", now - 1],
      [question, "done", now],
    ]);
    expect(log[0]).toMatchObject({ kind: "question", text: "Whether to offer UTF-16 output too" });
  });

  test("a refused edit is not logged", async () => {
    await patch(`/api/open-items/${await idOf("The CSV")}`, { state: "done" });
    expect(db.query("SELECT COUNT(*) AS n FROM open_item_decisions").get()).toEqual({ n: 0 });
  });

  test("won't reopen what the log closed, or close what is already closed", async () => {
    const issue = await idOf("The CSV");
    expect((await patch(`/api/open-items/${issue}`, { state: "open" })).status).toBe(409);
    expect((await patch(`/api/open-items/${issue}`, { state: "done" })).status).toBe(409);
  });

  test("refuses an unknown state or item, and a write from another site", async () => {
    const question = await idOf("Whether");
    expect((await patch(`/api/open-items/${question}`, { state: "closed" })).status).toBe(400);
    expect((await patch("/api/open-items/abc", { state: "done" })).status).toBe(400);
    expect((await patch("/api/open-items/99999", { state: "done" })).status).toBe(404);
    const cross = await patch(
      `/api/open-items/${question}`,
      { state: "done" },
      { origin: "https://evil.example" },
    );
    expect(cross.status).toBe(403);
    expect((await items()).find((i) => i.id === question)?.closedBy).toBeNull();
  });

  test("reopening an item the log settled while it was closed by hand closes it by ref again", async () => {
    const issue = await idOf("The CSV");
    // As if the user dismissed it before the log showed #21 closed
    db.run(
      "UPDATE open_items SET closed_at = ?, closed_by = 'dismissed', closed_block_id = NULL, closed_note = NULL WHERE id = ?",
      [min(1750), issue],
    );
    const reopened = (await (
      await patch(`/api/open-items/${issue}`, { state: "open" })
    ).json()) as LedgerEntry;
    expect(reopened).toMatchObject({ closedBy: "ref", closedNote: "closed #21" });
  });

  test("a hand close survives regenerating the section that opened the item", async () => {
    await patch(`/api/open-items/${await idOf("Whether")}`, { state: "dismissed" });
    await summarizer.summarize({ sessionId: SID.ledgerOpen, start: min(1700), mode: "summary" });
    expect((await items()).find((i) => i.text.startsWith("Whether"))?.closedBy).toBe("dismissed");
  });
});

test("the drawer lists what a section left open, as each stands now", async () => {
  await patch(`/api/open-items/${await idOf("Whether")}`, { state: "mistaken" });
  const session = await get<SessionDetail>(`/api/sessions/${SID.ledgerOpen}`);
  const section = session.sections.find((s) => s.start === min(1700));
  expect(section?.opens.map((o) => [o.kind, o.closedBy])).toEqual([
    ["issue", "ref"],
    ["todo", "ref"],
    ["question", "mistaken"],
    ["waiting", null],
  ]);
});

test("the drawer lists what a section closed", async () => {
  const session = await get<SessionDetail>(`/api/sessions/${SID.ledgerClose}`);
  expect(session.sections[0]?.closes.map((c) => [c.text, c.closedBy, c.closedNote])).toEqual([
    ["The CSV export is garbled in Excel (#21)", "ref", "closed #21"],
  ]);
});

describe("recap from the ledger", () => {
  const target = () => ({
    projectId:
      db
        .query<{ project_id: number }, [string]>("SELECT project_id FROM sessions WHERE id = ?")
        .get(SID.ledgerOpen)?.project_id ?? -1,
    from: FROM,
    to: TO,
  });

  test("gives the model what is still open and what was settled, not the sections' guesses", async () => {
    const input = loadRecapInput(db, target());
    if (!input) throw new Error("no recap input");
    const prompt = buildRecapPrompt(input);
    const block = prompt.slice(prompt.indexOf("<open_items>"), prompt.indexOf("</open_items>"));
    expect(block).toContain("Still open at the end of the period:");
    expect(block).toContain("- [waiting] Design review of the export dialog (left open ");
    expect(block).toContain("Settled during the period:");
    expect(block).toContain("- [issue] The CSV export is garbled in Excel (#21) (closed #21)");
    expect(prompt).toContain("Take open items only from <open_items>");
  });

  test("an item marked done by hand says so in the recap prompt", async () => {
    now = min(2000);
    await patch(`/api/open-items/${await idOf("Whether")}`, { state: "done" });
    const input = loadRecapInput(db, target());
    if (!input) throw new Error("no recap input");
    expect(buildRecapPrompt(input)).toContain(
      "- [question] Whether to offer UTF-16 output too (marked done by hand)",
    );
  });

  test("an item set aside or marked a mistake is neither open nor settled in the recap", async () => {
    now = min(2000);
    await patch(`/api/open-items/${await idOf("Whether")}`, { state: "mistaken" });
    await patch(`/api/open-items/${await idOf("Design review")}`, { state: "dismissed" });
    const input = loadRecapInput(db, target());
    if (!input) throw new Error("no recap input");
    const prompt = buildRecapPrompt(input);
    // The instructions above the material name the tag too; the block is its last opening
    const block = prompt.slice(prompt.lastIndexOf("<open_items>"), prompt.indexOf("</open_items>"));
    expect(block).toContain("Settled during the period:");
    expect(block).not.toContain("Whether to offer UTF-16");
    expect(block).not.toContain("Design review of the export dialog");
  });

  test("a project without ledger items hashes as before, so older recaps don't turn stale", () => {
    db.run("DELETE FROM open_items");
    const input = loadRecapInput(db, target());
    if (!input) throw new Error("no recap input");
    const { ledger: _, ...rest } = input;
    expect(recapHash(input)).toBe(Bun.hash(JSON.stringify(rest)).toString(16));
  });

  test("closing an item by hand marks the recap stale, and a dismissed one drops out", async () => {
    const before = recapHash(loadRecapInput(db, target()) ?? ({} as never));
    // Closed within the period; one closed after it was still open at the period's end
    now = min(2000);
    await patch(`/api/open-items/${await idOf("Design review")}`, { state: "dismissed" });
    const input = loadRecapInput(db, target());
    expect(recapHash(input ?? ({} as never))).not.toBe(before);
    expect(JSON.stringify(input?.ledger)).not.toContain("Design review");
  });
});
