// Reading JSON whose shape isn't guaranteed: tool inputs in the log and the model's answers.

/** The value as a JSON object, or null when it is anything else (an array, a string, null). */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
