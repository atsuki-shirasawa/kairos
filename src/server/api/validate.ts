// Request validators for the API. Each one turns untrusted input (query strings, JSON bodies) into
// a typed value at the boundary, so handlers and queries never re-check it.

import type {
  OpenItemUpdate,
  ProjectUpdate,
  RecapRequest,
  SettingsUpdate,
} from "../../shared/api.ts";
import { MIN_SEARCH_CHARS } from "../../shared/constants.ts";
import { DAY } from "../../shared/dates.ts";
import { isHandClose } from "../../shared/openItems.ts";
import { isSummaryLang } from "../../shared/summaryLang.ts";

/** Longest range the calendar can fetch at once (a month view plus margins). */
export const MAX_RANGE_MS = 62 * DAY;
/** Project colors are stored as palette keys (p0–p7). The actual colors are set per theme by the web app. */
const PALETTE_KEY = /^p[0-7]$/;
/** Longer queries are cut to this many characters. */
const MAX_QUERY_CHARS = 200;

/** A validated period in epoch ms, `from < to`. */
export interface Range {
  /** Start of the period (inclusive). */
  from: number;
  /** End of the period (exclusive). */
  to: number;
}

/** Why a range was refused; returned to the client as the 400 body. */
export interface InvalidRange {
  /** Message for the client. */
  error: string;
}

/** Validates the range (ms). Overly long ranges are refused, since they amount to returning everything. */
export function parseRange(
  fromParam: string | undefined,
  toParam: string | undefined,
): Range | InvalidRange {
  const from = Number(fromParam);
  const to = Number(toParam);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from)
    return { error: "from and to (ms, from < to) are required" };
  if (to - from > MAX_RANGE_MS) return { error: "Range too long (max 62 days)" };
  return { from, to };
}

/**
 * The search query to run for a `?q=` parameter: trimmed and cut to `MAX_QUERY_CHARS`, or null
 * when it is shorter than `MIN_SEARCH_CHARS`, since a short query would match nearly everything.
 */
export function parseSearchQuery(param: string | undefined): string | null {
  const query = (param ?? "").trim().slice(0, MAX_QUERY_CHARS);
  return [...query].length < MIN_SEARCH_CHARS ? null : query;
}

/**
 * Validates a `PATCH /api/settings` body; null unless it changes something, and only validly
 * (a supported language, a boolean).
 */
export function parseSettingsUpdate(body: unknown): SettingsUpdate | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const update: SettingsUpdate = {};
  if ("summaryLang" in b) {
    if (!isSummaryLang(b.summaryLang)) return null;
    update.summaryLang = b.summaryLang;
  }
  if ("showHeadless" in b) {
    if (typeof b.showHeadless !== "boolean") return null;
    update.showHeadless = b.showHeadless;
  }
  return Object.keys(update).length ? update : null;
}

/** Validates a `PATCH /api/projects/:id` body; null unless it changes something, and only validly. */
export function parseProjectUpdate(body: unknown): ProjectUpdate | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const update: ProjectUpdate = {};
  if ("color" in b) {
    if (b.color !== null && !(typeof b.color === "string" && PALETTE_KEY.test(b.color)))
      return null;
    update.color = b.color as string | null;
  }
  if ("hidden" in b) {
    if (typeof b.hidden !== "boolean") return null;
    update.hidden = b.hidden;
  }
  return Object.keys(update).length ? update : null;
}

/** Validates a `PATCH /api/open-items/:id` body; null unless it names a known state. */
export function parseOpenItemUpdate(body: unknown): OpenItemUpdate | null {
  if (typeof body !== "object" || body === null) return null;
  const { state } = body as Record<string, unknown>;
  return state === "open" || isHandClose(state) ? { state } : null;
}

/** Validates a `POST /api/recaps` body; null unless the project id and range are valid. */
export function parseRecapRequest(body: unknown): RecapRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { projectId, from, to } = body as Record<string, unknown>;
  if (!Number.isInteger(projectId)) return null;
  const range = parseRange(String(from), String(to));
  if ("error" in range || !Number.isSafeInteger(from) || !Number.isSafeInteger(to)) return null;
  return { projectId: projectId as number, from: range.from, to: range.to };
}
