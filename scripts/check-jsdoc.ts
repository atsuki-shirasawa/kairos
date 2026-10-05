#!/usr/bin/env bun
import { readFileSync } from "node:fs";

/** A declaration that is part of a module's public surface but has no JSDoc. */
export interface Undocumented {
  /** 1-based line of the declaration. */
  line: number;
  /** The declared name, or the start of the line when no name could be read. */
  name: string;
}

/** Source files whose exports must be documented. shadcn/ui components are generated, so skipped. */
const INCLUDE = ["src/**/*.ts", "src/**/*.tsx", "scripts/**/*.ts"];
const EXCLUDE = [/^src\/web\/src\/components\/ui\//, /\.d\.ts$/];

/** Re-exports carry the docs of what they re-export. */
const TOP_LEVEL_EXPORT = /^export (?!\{|\*|type \{)/;
const EXPORTED_CLASS = /^export (?:default )?(?:abstract )?class /;
/** A class member starts at two spaces; its body and parameters are indented further. */
const PUBLIC_MEMBER =
  /^ {2}(?!private |protected |#|constructor\b)(?:(?:public|static|readonly|async|override|get|set) )*([A-Za-z_$][\w$]*)\s*[(<:=!?]/;
/** Lines allowed between a JSDoc and its declaration. */
const PASS_THROUGH = /^\s*\/\/ (?:biome-ignore|@ts-)/;

/**
 * Finds exported declarations and public members of exported classes without a JSDoc right above.
 * Reads lines instead of an AST (TypeScript 7 ships no JS compiler API), so it relies on Biome's
 * formatting: top-level statements start at column 0 and class members at two spaces.
 */
export function findUndocumented(source: string): Undocumented[] {
  const lines = source.split("\n");
  const found: Undocumented[] = [];
  let inClass = false;
  lines.forEach((text, i) => {
    if (inClass && text.startsWith("}")) inClass = false;
    const member = inClass ? PUBLIC_MEMBER.exec(text) : null;
    if (TOP_LEVEL_EXPORT.test(text) || member) {
      if (!hasJsdocAbove(lines, i)) {
        found.push({ line: i + 1, name: member?.[1] ?? declaredName(text) });
      }
    }
    // A one-line class (`class E extends Error {}`) has no members to check
    if (EXPORTED_CLASS.test(text) && !text.trimEnd().endsWith("}")) inClass = true;
  });
  return found;
}

/** Whether the closest line above `index`, past lint directives, ends a `/** … *\/` block. */
function hasJsdocAbove(lines: string[], index: number): boolean {
  let i = index - 1;
  while (i >= 0 && PASS_THROUGH.test(lines[i] ?? "")) i--;
  if (!lines[i]?.trimEnd().endsWith("*/")) return false;
  while (i >= 0 && !lines[i]?.includes("/*")) i--;
  return lines[i]?.trimStart().startsWith("/**") ?? false;
}

/** The identifier an `export …` line declares, for the report. */
function declaredName(line: string): string {
  const m =
    /^export (?:default )?(?:declare )?(?:abstract )?(?:async )?(?:function\*?|class|interface|type|enum|const|let|var|namespace) +([\w$]+)/.exec(
      line,
    );
  return m?.[1] ?? line.slice(0, 60);
}

/** Lists the files to check, relative to the working directory. */
function sourceFiles(): string[] {
  const files = INCLUDE.flatMap((pattern) => [...new Bun.Glob(pattern).scanSync(".")]);
  return [...new Set(files)].filter((f) => !EXCLUDE.some((re) => re.test(f))).sort();
}

if (import.meta.main) {
  const problems = sourceFiles().flatMap((file) =>
    findUndocumented(readFileSync(file, "utf8")).map((u) => `${file}:${u.line}  ${u.name}`),
  );
  if (problems.length > 0) {
    console.error(`Missing JSDoc on ${problems.length} exported declarations:\n`);
    console.error(problems.join("\n"));
    process.exit(1);
  }
}
