import { describe, expect, test } from "bun:test";
import type { Runner } from "../../../src/server/summarize/claude.ts";
import type { LedgerItem } from "../../../src/server/summarize/ledger/items.ts";
import { SUMMARY_SCHEMA, TITLE_SCHEMA } from "../../../src/server/summarize/output.ts";
import { PROMPT_VERSION } from "../../../src/server/summarize/prompt.ts";
import {
  answerSection,
  interpretSection,
  type PreparedSection,
  prepareSection,
  UnfitAnswerError,
} from "../../../src/server/summarize/section.ts";
import { Summarizer } from "../../../src/server/summarize/summarizer.ts";
import type { Mode } from "../../../src/server/summarize/target.ts";
import { SID } from "../../fixtures/ids.ts";
import { envelope, markdownRunner, STUB_STATS } from "../answers.ts";
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
  mode,
  lang: "en",
});

const answer = {
  summary: {
    headline: "Login form",
    short: "Login",
    body: "- Goal: g\n- Done:\n  - d\n- Open:\n  - [todo] left",
  },
  opened: [{ kind: "todo" as const, text: "left" }],
  closures: [
    { label: "O2", note: "merged #4" },
    { label: "O9", note: "unknown" },
  ],
};

describe("interpretSection", () => {
  test("keeps the answer, records how it was written, and closes offered labels by ID", () => {
    const p = { ...prepared("summary"), prompt: "the prompt" };
    expect(interpretSection({ answer, stats: STUB_STATS, asks: 1 }, p)).toEqual({
      blockId: 3,
      summary: answer.summary,
      run: {
        promptVersion: PROMPT_VERSION,
        inputHash: Bun.hash("the prompt").toString(16),
        ...STUB_STATS,
      },
      ledger: {
        end: 99,
        opened: [{ kind: "todo", text: "left" }],
        tasks: [],
        closed: [{ id: 8, note: "merged #4" }],
      },
    });
  });
});

/** A runner that answers each ask with the next of `answers`, as envelopes. */
function asking(...answers: unknown[]) {
  const asked: { prompt: string; schema: object | undefined }[] = [];
  const run: Runner = async (prompt, schema) => {
    asked.push({ prompt, schema });
    return envelope(answers[asked.length - 1]);
  };
  return { run, asked };
}

const full = {
  headline: "Login form validation",
  short: "Login form",
  goal: "g",
  done: ["d"],
  resolved: [],
  open: [{ kind: "todo", text: "left" }],
  closed: [],
};

describe("answerSection", () => {
  const req = { prompt: "p", mode: "summary" as const, lang: "en" as const };

  test("renders a full answer's body and asks with the summary schema", async () => {
    const { run, asked } = asking(full);
    expect(await answerSection(run, req)).toEqual({
      answer: {
        summary: {
          headline: "Login form validation",
          short: "Login form",
          body: "- Goal: g\n- Done:\n  - d\n- Open:\n  - [todo] left",
        },
        opened: [{ kind: "todo", text: "left" }],
        closures: [],
      },
      stats: STUB_STATS,
      asks: 1,
    });
    expect(asked).toEqual([{ prompt: "p", schema: SUMMARY_SCHEMA }]);
  });

  test("a headline-only answer keeps no body and asks with the title schema", async () => {
    const { run, asked } = asking({ headline: "Login form validation", short: "" });
    expect((await answerSection(run, { ...req, mode: "title" })).answer).toEqual({
      summary: { headline: "Login form validation", short: null, body: "" },
      opened: [],
      closures: [],
    });
    expect(asked.map((a) => a.schema)).toEqual([TITLE_SCHEMA]);
  });

  test("asks once more, told why, when the headline talks about the task", async () => {
    const { run, asked } = asking({ ...full, headline: "Here is the summary of the work" }, full);
    const answered = await answerSection(run, req);
    expect(answered.asks).toBe(2);
    expect(answered.answer.summary.headline).toBe("Login form validation");
    expect(answered.stats.costUsd).toBeCloseTo(STUB_STATS.costUsd * 2);
    expect(asked[1]?.prompt).toBe(
      "p\nAn earlier answer to this was rejected: The headline talked about the task or the summary instead of naming the work. Answer again, following the rules above.\n",
    );
  });

  test("keeps a sentence on the last ask, since it still names the work", async () => {
    const sentence = { ...full, headline: "Login form validation was added." };
    const { run } = asking(sentence, sentence);
    const answered = await answerSection(run, req);
    expect(answered.asks).toBe(2);
    expect(answered.answer.summary.headline).toBe("Login form validation was added.");
  });

  test("fails when the last answer still talks about the task, with what the asks cost", async () => {
    const { run, asked } = asking(
      { ...full, done: [] },
      { ...full, headline: "Here's the summary" },
    );
    const failure = await answerSection(run, req).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(UnfitAnswerError);
    expect(failure).toMatchObject({
      message: "The headline talked about the task or the summary instead of naming the work",
      asks: 2,
    });
    expect((failure as UnfitAnswerError).stats.costUsd).toBeCloseTo(STUB_STATS.costUsd * 2);
    expect(asked[1]?.prompt).toContain(
      "rejected: The answer lacked a headline, a goal or the work done.",
    );
  });

  test("keeps a headline whose only flaw is its length", async () => {
    const { run } = asking({ ...full, headline: "Login" });
    expect((await answerSection(run, req)).answer.summary.headline).toBe("Login");
  });

  test("drops a short title that talks about the task, keeping the rest", async () => {
    const { run } = asking({ ...full, short: "Here is the short title" });
    const answered = await answerSection(run, req);
    expect(answered.asks).toBe(1);
    expect(answered.answer.summary.short).toBeNull();
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
      markdownRunner(async () => {
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
      }),
      { quiet: true },
    );
    expect(await summarizer.summarize(target)).toEqual({
      status: "failed",
      error: "The block moved while it was summarized",
    });
    expect(db.query("SELECT COUNT(*) AS n FROM summaries").get()).toEqual({ n: 0 });
  });
});
