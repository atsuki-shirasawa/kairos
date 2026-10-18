/**
 * A list of values as an SQL `IN (…)` operand, for the kinds, tool names and `closed_by` values
 * named once in TS. The values are constants, never user input, so they are quoted inline.
 */
export function sqlList(values: readonly string[]): string {
  return `(${values.map((v) => `'${v}'`).join(", ")})`;
}
