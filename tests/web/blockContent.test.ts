import { describe, expect, test } from "bun:test";
import {
  BODY_MIN_PX,
  blockBody,
  blockContent,
  META_MIN_PX,
} from "../../src/web/src/lib/blockContent.ts";
import type { BlockGeometry } from "../../src/web/src/lib/blockGeometry.ts";
import { segment } from "./helpers.ts";

/** A block with `body` as its summary. */
const block = (body: string | null) => ({ segment: { ...segment(0, 1, "x"), body } });

/** An uncovered block `px` tall, with the heading lines that fit. */
const geo = (px: number, lines = 3): BlockGeometry => ({
  top: 0,
  height: px,
  filledPx: px,
  stretched: false,
  short: px < 34,
  visible: px,
  lines,
});

const week = { detailed: false, selected: false, momentCount: 0 };
const day = { detailed: true, selected: false, momentCount: 0 };

describe("blockBody", () => {
  test("shows the summary's goal, or a body in another format whole", () => {
    expect(blockBody("- Goal: Fix the toolbar\n- Done: Fixed it")).toBe("Fix the toolbar");
    expect(blockBody("free text")).toBe("free text");
    expect(blockBody(null)).toBeNull();
  });
});

describe("blockContent", () => {
  test("a week block shows only its heading, in the lines that fit", () => {
    expect(blockContent(block("free text"), geo(200), week)).toEqual({
      meta: false,
      lines: 3,
      body: null,
      lane: false,
    });
  });

  test("a selected week block tall enough gets the time range, and the heading the lines left", () => {
    const content = blockContent(block(null), geo(META_MIN_PX), { ...week, selected: true });
    expect(content.meta).toBe(true);
    expect(content.lines).toBe(1);
  });

  test("a tall day block shows its body under a two-line heading", () => {
    const content = blockContent(block("free text"), geo(BODY_MIN_PX), day);
    expect(content).toMatchObject({ meta: true, lines: 2, body: "free text" });
  });

  test("a short block keeps one line whatever else it shows", () => {
    expect(blockContent(block("free text"), geo(30, 1), day).lines).toBe(1);
  });

  test("the lane needs commits or PRs and room for two rows", () => {
    expect(blockContent(block(null), geo(36), { ...day, momentCount: 2 }).lane).toBe(true);
    expect(blockContent(block(null), geo(35), { ...day, momentCount: 2 }).lane).toBe(false);
    expect(blockContent(block(null), geo(200), day).lane).toBe(false);
    expect(blockContent(block(null), geo(200), { ...week, momentCount: 2 }).lane).toBe(false);
  });
});
