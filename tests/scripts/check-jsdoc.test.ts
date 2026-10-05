import { describe, expect, test } from "bun:test";
import { findUndocumented } from "../../scripts/check-jsdoc.ts";

const names = (source: string) => findUndocumented(source).map((u) => u.name);

describe("findUndocumented", () => {
  test("flags exported declarations without a JSDoc right above", () => {
    const source = [
      "/** Documented. */",
      "export function a() {}",
      "// A line comment is not a JSDoc",
      "export const b = 1;",
      "/* Neither is a block comment */",
      "export type C = string;",
      "export interface D {}",
      "",
      "/** A blank line breaks the link. */",
      "",
      "export async function e() {}",
    ].join("\n");
    expect(findUndocumented(source)).toEqual([
      { line: 4, name: "b" },
      { line: 6, name: "C" },
      { line: 7, name: "D" },
      { line: 11, name: "e" },
    ]);
  });

  test("accepts multi-line JSDoc and lint directives in between", () => {
    const source = [
      "/**",
      " * Documented.",
      " */",
      "// biome-ignore lint/suspicious/noExplicitAny: reason",
      "export function a() {}",
    ].join("\n");
    expect(names(source)).toEqual([]);
  });

  test("skips re-exports and non-exported declarations", () => {
    const source = ['export { cn } from "cn";', 'export * from "./x.ts";', "function f() {}"];
    expect(names(source.join("\n"))).toEqual([]);
  });

  test("checks public members of exported classes only", () => {
    const source = [
      "/** A class. */",
      "export class K {",
      "  constructor(private readonly x: number) {}",
      "  /** Documented. */",
      "  run() {}",
      "  stop(): void {",
      "    const inner = () => {};",
      "  }",
      "  readonly size: number = 1;",
      "  private hidden() {}",
      "  static async make<T>() {}",
      "}",
      "/** One line. */",
      "export class E extends Error {}",
      "/** Not a class. */",
      "export interface I {",
      "  field: string;",
      "}",
      "class Internal {",
      "  open() {}",
      "}",
    ].join("\n");
    expect(names(source)).toEqual(["stop", "size", "make"]);
  });
});
