import { describe, expect, test } from "bun:test";
import { takeClosures } from "../../../src/server/summarize/prompt.ts";

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
});
