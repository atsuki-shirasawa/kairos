/**
 * Most characters stored per field of a message row. A compact summary runs past 20k characters;
 * past the limit, its end (pending tasks, next step) is kept.
 */
export const LIMIT = {
  text: 20_000,
  compactSummary: 40_000,
  toolInput: 4_000,
  toolResult: 4_000,
  short: 2_000,
};
