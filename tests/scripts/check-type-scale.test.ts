import { describe, expect, test } from "bun:test";
import { findOffScale } from "../../scripts/check-type-scale.ts";

const sizes = (source: string) => findOffScale(source).map((o) => o.size);

describe("findOffScale", () => {
  test("flags arbitrary absolute sizes and Tailwind's own size names", () => {
    expect(
      sizes(
        '"text-[13px] text-[0.8rem] text-[length:12px] text-[10pt] text-xs max-lg:text-sm text-base text-2xl [&_p]:text-lg"',
      ),
    ).toEqual([
      "text-[13px]",
      "text-[0.8rem]",
      "text-[length:12px]",
      "text-[10pt]",
      "text-xs",
      "text-sm",
      "text-base",
      "text-2xl",
      "text-lg",
    ]);
  });

  test("passes the scale, relative sizes, colors and alignment", () => {
    expect(
      sizes(
        '"text-meta text-label text-body text-read text-title text-[0.85em] text-[90%] text-muted-foreground text-left text-xs-ish"',
      ),
    ).toEqual([]);
  });

  test("finds them in a stylesheet's @apply too", () => {
    expect(sizes(".x {\n  @apply text-sm font-medium;\n}")).toEqual(["text-sm"]);
  });

  test("reports the line of each", () => {
    expect(findOffScale('a\n"text-xs"\nb "text-[9px]"')).toEqual([
      { line: 2, size: "text-xs" },
      { line: 3, size: "text-[9px]" },
    ]);
  });
});
