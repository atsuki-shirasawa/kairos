import { describe, expect, test } from "bun:test";
import { legacyLayout } from "../../src/web/src/lib/legacyUrl.ts";

const layout = (search: string) => legacyLayout(new URLSearchParams(search));

describe("legacyLayout", () => {
  test("reads every value the layout parameter took", () => {
    expect(layout("layout=calendar")).toBe("calendar");
    expect(layout("layout=summary")).toBe("summary");
    expect(layout("layout=list")).toBe("table");
    // The live page went into Today's Now
    expect(layout("layout=live")).toBe("today");
    expect(layout("layout=live&date=2026-10-01")).toBe("today");
  });

  test("a period without a layout opens the calendar, as links before the home page did", () => {
    for (const q of ["date=2026-10-01", "view=day", "q=migration", "in=12", "layout=grid&view=day"])
      expect(layout(q)).toBe("calendar");
  });

  test("nothing, or only the open block, is Today", () => {
    for (const q of ["", "session=abc&at=42", "layout=grid&at=x"]) expect(layout(q)).toBe("today");
  });
});
