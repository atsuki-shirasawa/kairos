import { describe, expect, test } from "bun:test";
import type { LedgerItem } from "../../../src/server/summarize/ledger/items.ts";
import {
  interpretSection,
  type PreparedSection,
  prepareSection,
} from "../../../src/server/summarize/section.ts";
import { Summarizer } from "../../../src/server/summarize/summarizer.ts";
import type { Mode } from "../../../src/server/summarize/target.ts";
import { SID } from "../../fixtures/ids.ts";
import { min, setup } from "../ingest/helpers.ts";

const candidate = (id: number) => ({ id }) as LedgerItem;

/** A prepared section with two earlier items offered as O1 and O2. */
const prepared = (mode: Mode): PreparedSection => ({
  target: { sessionId: "s", start: 0, mode },
  input: {
    blockId: 3,
    end: 99,
    prompt: { sessionTitle: "t", projectName: null, previous: [], digest: "d" },
    refs: [],
    tasks: [],
  },
  candidates: [candidate(7), candidate(8)],
  labeled: [
    { label: "O1", kind: null, text: "a", from: "earlier in this session" },
    { label: "O2", kind: null, text: "b", from: "earlier in this session" },
  ],
  prompt: "",
});

const OUTPUT =
  "Login form\n\n- Goal: g\n- Done: d\n- Open:\n  - [todo] left\n- Closed:\n  - [O2] merged #4\n  - [O9] unknown";

describe("interpretSection", () => {
  test("a full summary keeps its body, opens its Open items and closes offered labels by ID", () => {
    expect(interpretSection(OUTPUT, prepared("summary"))).toEqual({
      blockId: 3,
      summary: { headline: "Login form", body: "- Goal: g\n- Done: d\n- Open:\n  - [todo] left" },
      ledger: {
        end: 99,
        opened: [{ kind: "todo", text: "left" }],
        tasks: [],
        closed: [{ id: 8, note: "merged #4" }],
      },
    });
  });

  test("a headline-only summary keeps nothing but the headline", () => {
    expect(interpretSection(OUTPUT, prepared("title"))).toEqual({
      blockId: 3,
      summary: { headline: "Login form", body: "" },
      ledger: { end: 99, opened: [], tasks: [], closed: [] },
    });
  });

  test("is null for output without a headline", () => {
    expect(interpretSection("  \n", prepared("summary"))).toBeNull();
  });
});

describe("prepareSection / summarize", () => {
  test("a section that is gone has no conversation, and summarizing it is skipped", async () => {
    const { db } = setup();
    expect(prepareSection(db, { sessionId: "gone", start: 1, mode: "summary" }, "en")).toBe(
      "no-conversation",
    );
    const summarizer = new Summarizer(db, async () => "x", { quiet: true });
    expect(await summarizer.summarize({ sessionId: "gone", start: 1 })).toEqual({
      status: "skipped",
      error: "No conversation to summarize",
    });
  });

  test("a summary is not saved on another block that took its start while the model ran", async () => {
    const { db, ingester } = setup();
    ingester.scan();
    const target = { sessionId: SID.basic, start: min(45) };
    const summarizer = new Summarizer(
      db,
      async () => {
        // As if a split gave this start to a new block, the old one keeping the larger part
        db.query("UPDATE segments SET start = start + 1 WHERE session_id = ? AND start = ?").run(
          SID.basic,
          min(45),
        );
        db.query("INSERT INTO segments (session_id, start, end) VALUES (?, ?, ?)").run(
          SID.basic,
          min(45),
          min(46),
        );
        return "Login screen\n\n- Goal: g\n- Done: d";
      },
      { quiet: true },
    );
    expect(await summarizer.summarize(target)).toEqual({
      status: "failed",
      error: "The block moved while it was summarized",
    });
    expect(db.query("SELECT COUNT(*) AS n FROM summaries").get()).toEqual({ n: 0 });
  });
});
