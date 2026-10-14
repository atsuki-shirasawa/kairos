// Rules about open items that the server's recaps, the CLI and the web app must agree on.

/** Whether an open item was still open at time `t`: never closed, or closed only at or after `t`. */
export function isOpenAt(item: { closedAt: number | null }, t: number): boolean {
  return item.closedAt === null || item.closedAt >= t;
}
