import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MIGRATIONS, openDb, SCHEMA_VERSION } from "../../src/server/db/index.ts";
import { refsOf, takeClosures } from "../../src/server/summarize/ledger.ts";
import { Summarizer } from "../../src/server/summarize/summarizer.ts";
import { SID } from "../fixtures/ids.ts";
import { min, setup } from "./ingest/helpers.ts";

/** What the first section of the ledger scenario leaves open, as the model would write it. */
const OPENING = `CSV export garbled in Excel

- Goal: find why the CSV export is garbled in Excel
- Done:
  - Filed issue #21 and task #1
- Open:
  - [issue] The CSV export is garbled in Excel (#21)
  - [todo] Add a BOM to the CSV export
  - [question] Whether to offer UTF-16 output too`;

let db: Database;
let prompts: string[];
let replies: Map<string, string>;
let summarizer: Summarizer;

beforeEach(() => {
  const s = setup();
  s.ingester.scan();
  db = s.db;
  prompts = [];
  replies = new Map();
  summarizer = new Summarizer(
    db,
    async (p) => {
      prompts.push(p);
      // Each section's reply is picked by a phrase from its transcript
      for (const [phrase, reply] of replies) if (p.includes(phrase)) return reply;
      return "Some work\n\n- Goal: work\n- Done: worked";
    },
    { now: () => min(10_000), model: "test-model", quiet: true },
  );
  replies.set("[User] CSV エクスポート", OPENING);
});

type Row = {
  text: string;
  refs: string;
  closed_by: string | null;
  closed_session_id: string | null;
  closed_start: number | null;
  closed_note: string | null;
};

const items = () =>
  db
    .query<Row, []>(
      `SELECT text, refs, closed_by, closed_session_id, closed_start, closed_note
       FROM open_items ORDER BY id`,
    )
    .all();

const item = (prefix: string) => items().find((i) => i.text.startsWith(prefix));

const bodyAt = (minute: number) =>
  db
    .query<{ body: string }, [number]>("SELECT body FROM summaries WHERE start = ?")
    .get(min(minute))?.body;

const summarize = (sessionId: string, minute: number, mode: "summary" | "title" = "summary") =>
  summarizer.summarize({ sessionId, start: min(minute), mode });

describe("refsOf", () => {
  test("reads issue and PR numbers, URLs, Jira keys and tasks", () => {
    expect(
      refsOf(
        "Review of #42 (https://github.com/me/app/pull/43, /issues/44), APP-31, task #3, タスク #4",
      ).sort(),
    ).toEqual(["#42", "#43", "#44", "APP-31", "task:3", "task:4"]);
  });

  test("leaves out encodings, anchors and HTML entities", () => {
    expect(refsOf("UTF-8 and ISO-8601, see README#2 and &#39;")).toEqual([]);
  });
});

describe("takeClosures", () => {
  test("splits the Closed item off the body, with each label's evidence", () => {
    const body =
      "- Goal: g\n- Done: d\n- Closed:\n  - [O1] merged in PR #9\n  - O3: the user chose not to\n";
    expect(takeClosures(body)).toEqual({
      body: "- Goal: g\n- Done: d",
      closures: [
        { label: "O1", note: "merged in PR #9" },
        { label: "O3", note: "the user chose not to" },
      ],
    });
  });

  test("reads an inline list of labels and keeps items after the Closed one", () => {
    expect(takeClosures("- Goal: g\n- **Closed:** O1, O2\n- Done: d")).toEqual({
      body: "- Goal: g\n- Done: d",
      closures: [
        { label: "O1", note: "" },
        { label: "O2", note: "" },
      ],
    });
  });
});

test("reads a label with words before its colon, and several closures on one line", () => {
  expect(takeClosures("- Goal: g\n- Closed items: O1 and O3\n- Done: d")).toEqual({
    body: "- Goal: g\n- Done: d",
    closures: [
      { label: "O1", note: "" },
      { label: "O3", note: "" },
    ],
  });
  expect(
    takeClosures("- Closed (from open_items): [O1] merged #40; [O2] issue closed").closures,
  ).toEqual([
    { label: "O1", note: "merged #40" },
    { label: "O2", note: "issue closed" },
  ]);
});

describe("open items ledger", () => {
  test("records a section's open items with their refs, and closes those the log shows settled later", async () => {
    expect(await summarize(SID.ledgerOpen, 1700)).toBe(true);
    // The task is named by its subject; the log already holds the later task update and issue close
    expect(items().map((i) => [i.text, JSON.parse(i.refs), i.closed_by])).toEqual([
      ["The CSV export is garbled in Excel (#21)", ["#21"], "ref"],
      ["Add a BOM to the CSV export", ["task:1"], "ref"],
      ["Whether to offer UTF-16 output too", [], null],
    ]);
    expect(item("Add a BOM")).toMatchObject({
      closed_session_id: SID.ledgerOpen,
      closed_start: min(1740),
      closed_note: "task #1 completed",
    });
    // Opened in one session, closed in a later one
    expect(item("The CSV")).toMatchObject({
      closed_session_id: SID.ledgerClose,
      closed_start: min(1800),
      closed_note: "closed #21",
    });
    // Nothing earlier was open, so the prompt says nothing about earlier items
    expect(prompts[0]).not.toContain("<open_items>");
    // The Open item stays in the saved body; it is what the drawer shows
    expect(bodyAt(1700)).toContain("- [question] Whether to offer UTF-16 output too");
  });

  test("the closing section summarized first still closes the item once it is opened", async () => {
    // Automatic runs go newest first, so the section that settles an item often comes first
    await summarize(SID.ledgerClose, 1800, "title");
    await summarize(SID.ledgerOpen, 1740, "title");
    await summarize(SID.ledgerOpen, 1700);
    expect(item("The CSV")?.closed_session_id).toBe(SID.ledgerClose);
    expect(item("Add a BOM")?.closed_start).toBe(min(1740));
  });

  test("a later section sees the session's open items and closes one on the model's word", async () => {
    await summarize(SID.ledgerOpen, 1700);
    replies.set(
      "[User] BOM を付けて",
      "Adding a BOM\n\n- Goal: add a BOM\n- Done: added it\n- Closed:\n  - [O1] the user settled on UTF-8 with a BOM",
    );
    await summarize(SID.ledgerOpen, 1740);
    const p = prompts[1] ?? "";
    expect(p).toContain("<open_items>");
    // Items already closed by the log aren't offered
    expect(p).toContain(
      "- [O1] [question] Whether to offer UTF-16 output too (from earlier in this session)",
    );
    expect(p).not.toContain("[O2]");
    expect(p).toContain("- Closed:");
    expect(item("Whether")).toMatchObject({
      closed_by: "model",
      closed_session_id: SID.ledgerOpen,
      closed_start: min(1740),
      closed_note: "the user settled on UTF-8 with a BOM",
    });
    // The Closed item isn't saved with the summary
    expect(bodyAt(1740)).toBe("- Goal: add a BOM\n- Done: added it");
  });

  test("another session of the project sees an item only when it names the same ref", async () => {
    await summarize(SID.ledgerOpen, 1700);
    // As if the log didn't show #21 closed yet
    db.run("UPDATE open_items SET closed_at = NULL, closed_by = NULL WHERE text LIKE 'The CSV%'");
    await summarize(SID.ledgerClose, 1800);
    const p = prompts[1] ?? "";
    expect(p).toContain(
      '- [O1] [issue] The CSV export is garbled in Excel (#21) (from an earlier session ("CSV export garbled in Excel"))',
    );
    expect(p).not.toContain("UTF-16");
    // Saving the section runs the ref check again
    expect(item("The CSV")?.closed_by).toBe("ref");
  });

  test("regenerating a section rewrites what it opened and the closes it made", async () => {
    await summarize(SID.ledgerOpen, 1700);
    replies.set(
      "[User] BOM を付けて",
      "Adding a BOM\n\n- Goal: add a BOM\n- Done: added it\n- Closed:\n  - [O1] decided",
    );
    await summarize(SID.ledgerOpen, 1740);
    expect(item("Whether")?.closed_by).toBe("model");
    replies.set("[User] BOM を付けて", "Adding a BOM\n\n- Goal: add a BOM\n- Done: added it");
    await summarize(SID.ledgerOpen, 1740);
    expect(item("Whether")?.closed_by).toBeNull();
    await summarize(SID.ledgerOpen, 1700);
    expect(items()).toHaveLength(3);
  });

  test("regenerating the section that opened an item keeps a later section's closure of it", async () => {
    await summarize(SID.ledgerOpen, 1700);
    replies.set(
      "[User] BOM を付けて",
      "Adding a BOM\n\n- Goal: add a BOM\n- Done: added it\n- Closed:\n  - [O1] decided",
    );
    await summarize(SID.ledgerOpen, 1740);
    await summarize(SID.ledgerOpen, 1700);
    expect(item("Whether")).toMatchObject({ closed_by: "model", closed_start: min(1740) });
  });

  test("a closure naming a label that wasn't given is ignored", async () => {
    await summarize(SID.ledgerOpen, 1700);
    replies.set(
      "[User] BOM を付けて",
      "Adding a BOM\n\n- Goal: add a BOM\n- Done: added it\n- Closed:\n  - [O9] something",
    );
    expect(await summarize(SID.ledgerOpen, 1740)).toBe(true);
    expect(items().filter((i) => i.closed_by === "model")).toEqual([]);
  });
});

test("migration 9 adds the open items table, keeping an existing DB's summaries", () => {
  const path = join(tmpdir(), `kairos-ledger-${crypto.randomUUID()}.db`);
  const old = new Database(path, { create: true });
  for (const [i, sql] of MIGRATIONS.slice(0, 8).entries()) {
    old.run(sql);
    old.run(`PRAGMA user_version = ${i + 1}`);
  }
  old.run("INSERT INTO sessions (id) VALUES ('s')");
  old.run("INSERT INTO summaries VALUES ('s', 1, 'h', 'b', 'm', 2, 3)");
  old.close();
  const upgraded = openDb(path);
  expect(upgraded.query("SELECT headline FROM summaries").get()).toEqual({ headline: "h" });
  expect(upgraded.query("SELECT COUNT(*) AS n FROM open_items").get()).toEqual({ n: 0 });
  expect(
    upgraded.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version,
  ).toBe(SCHEMA_VERSION);
  upgraded.close();
});
