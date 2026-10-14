import { describe, expect, test } from "bun:test";
import {
  finishCluster,
  layoutDay,
  type PlacedBlock,
  pickColumn,
  spanInto,
} from "../../src/web/src/lib/layout.ts";
import { at, DAY0, session } from "./helpers.ts";

/** Per block: [column, column count, span, stacking depth]. */
const placement = (blocks: ReturnType<typeof layoutDay>) =>
  Object.fromEntries(
    blocks.map((b) => [
      `${b.session.id}@${(b.start / 3_600_000).toFixed(2)}`,
      [b.col, b.cols, b.span, b.depth],
    ]),
  );

describe("layoutDay", () => {
  test("blocks that don't overlap each take the full width", () => {
    const blocks = layoutDay([session("a", [at(9), at(10)]), session("b", [at(11), at(12)])], DAY0);
    expect(placement(blocks)).toEqual({ "a@9.00": [0, 1, 1, 0], "b@11.00": [0, 1, 1, 0] });
  });

  test("blocks starting at least one heading line apart stack in the same column instead of splitting", () => {
    const blocks = layoutDay(
      [
        session("a", [at(9), at(12)]),
        session("b", [at(10), at(11)]),
        session("c", [at(11.5), at(13)]),
        session("d", [at(15), at(16)]),
      ],
      DAY0,
    );
    expect(placement(blocks)).toEqual({
      "a@9.00": [0, 1, 1, 0],
      "b@10.00": [0, 1, 1, 1],
      // b visually ends at 11:00 too, so it stacks one level over a
      "c@11.50": [0, 1, 1, 1],
      "d@15.00": [0, 1, 1, 0],
    });
    // a's heading must fit before 10:00, where b starts covering it
    expect(blocks.find((b) => b.session.id === "a")?.coveredFrom).toBe(10 * 3_600_000);
    expect(blocks.find((b) => b.session.id === "c")?.coveredFrom).toBeNull();
  });

  test("blocks split side by side only when they start almost together and headings would collide", () => {
    const blocks = layoutDay(
      [
        session("long", [at(9), at(12)]),
        session("x", [at(10), at(10.25)]),
        session("y", [at(10.1), at(10.5)]),
      ],
      DAY0,
    );
    expect(placement(blocks)).toEqual({
      "long@9.00": [0, 2, 1, 0],
      "x@10.00": [0, 2, 1, 1],
      "y@10.10": [1, 2, 1, 0],
    });
  });

  test("short blocks count as overlapping for their minimum drawn height", () => {
    // Ten minutes is a card, drawn 25 minutes tall, so b starting 12 minutes later sits beside it
    const blocks = layoutDay(
      [session("a", [at(9), at(9 + 10 / 60)]), session("b", [at(9.2), at(9.4)])],
      DAY0,
    );
    expect(placement(blocks)).toEqual({ "a@9.00": [0, 2, 1, 0], "b@9.20": [1, 2, 1, 0] });
  });

  test("work under ten minutes becomes a mark and takes no column", () => {
    const blocks = layoutDay(
      [session("long", [at(9), at(12)]), session("quick", [at(10), at(10.1)])],
      DAY0,
    );
    expect(placement(blocks)).toEqual({ "long@9.00": [0, 1, 1, 0], "quick@10.00": [0, 1, 1, 0] });
    expect(Object.fromEntries(blocks.map((b) => [b.session.id, b.mark]))).toEqual({
      long: false,
      quick: true,
    });
    // A mark never covers the card it sits beside
    expect(blocks.find((b) => b.session.id === "long")?.coveredFrom).toBeNull();
  });

  test("picks the column with the fewest blocks underneath and widens into free columns on the right", () => {
    const blocks = layoutDay(
      [
        session("a", [at(9), at(12)]),
        session("b", [at(9.05), at(9.3)]),
        session("c", [at(9.1), at(9.35)]),
        session("d", [at(10), at(10.5)]),
      ],
      DAY0,
    );
    expect(placement(blocks)).toEqual({
      "a@9.00": [0, 3, 1, 0],
      "b@9.05": [1, 3, 1, 0],
      "c@9.10": [2, 3, 1, 0],
      // Rather than stacking over a, use the column b freed up and widen into c's column
      "d@10.00": [1, 3, 2, 0],
    });
  });

  test("blocks spanning midnight are clipped per day", () => {
    const s = session("late", [at(23), at(25)]);
    const today = layoutDay([s], DAY0);
    const tomorrow = layoutDay([s], DAY0 + 86_400_000);
    expect(today[0]).toMatchObject({
      start: 23 * 3_600_000,
      end: 86_400_000,
      continuesAfter: true,
      continuesBefore: false,
    });
    expect(tomorrow[0]).toMatchObject({
      start: 0,
      end: 3_600_000,
      continuesBefore: true,
      continuesAfter: false,
    });
    expect(tomorrow[0]?.dayStart).toBe(DAY0 + 86_400_000);
  });
});

/** A card placed in `col` from hour `from` to hour `to` on DAY0, for the cluster steps. */
const card = (id: string, col: number, from: number, to: number): PlacedBlock => {
  const [block] = layoutDay([session(id, [at(from), at(to)])], DAY0);
  if (!block) throw new Error("no block laid out");
  return { ...block, col };
};

describe("pickColumn", () => {
  test("a block starting a heading line after a column's last block stacks there", () => {
    expect(pickColumn([[card("a", 0, 9, 12)]], at(10) - DAY0)).toEqual({ col: 0, depth: 1 });
  });

  test("no column has room for a block starting almost together with the last", () => {
    expect(pickColumn([[card("a", 0, 9, 12)]], at(9.1) - DAY0).col).toBe(-1);
  });

  test("of the columns with room, the one with the fewest blocks still underneath wins", () => {
    const columns = [[card("a", 0, 9, 12)], [card("b", 1, 9, 9.5)]];
    expect(pickColumn(columns, at(10) - DAY0)).toEqual({ col: 1, depth: 0 });
  });
});

describe("spanInto", () => {
  test("widens over columns to the right that are free where it is drawn", () => {
    const a = card("a", 0, 9, 9.5);
    const columns = [[a], [card("b", 1, 11, 12)]];
    expect(spanInto(a, columns)).toBe(2);
  });

  test("stops at a column holding a block it overlaps", () => {
    const a = card("a", 0, 9, 12);
    const columns = [[a], [card("b", 1, 9.1, 10)]];
    expect(spanInto(a, columns)).toBe(1);
  });
});

describe("finishCluster", () => {
  test("gives each block the cluster's column count and its span, column by column", () => {
    const a = card("a", 0, 9, 12);
    const b = card("b", 1, 9.1, 10);
    const c = card("c", 0, 10, 11);
    const all = finishCluster([[a, c], [b]]);
    expect(all.map((x) => [x.session.id, x.cols, x.span])).toEqual([
      ["a", 2, 1],
      ["c", 2, 2],
      ["b", 2, 1],
    ]);
  });
});
