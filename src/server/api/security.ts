import type { MiddlewareHandler } from "hono";
import { ALLOWED_HOSTS } from "../../shared/constants.ts";

/**
 * Never load any external resource. Conversation logs may contain Markdown or HTML pointing at arbitrary URLs,
 * and merely displaying them must not contact the outside.
 */
export const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

function hostname(host: string): string {
  // IPv6 forms like [::1]:4319 are not handled (we listen on 127.0.0.1 only)
  return host.replace(/:\d+$/, "");
}

/** Rejects a non-loopback Host header (DNS rebinding defense). Adds the CSP to every response. */
export const guardHost: MiddlewareHandler = async (c, next) => {
  // Bun.serve builds the URL from the Host header too. Without the header (tests), look at the URL.
  const host = c.req.header("host") ?? new URL(c.req.url).host;
  if (!(ALLOWED_HOSTS as readonly string[]).includes(hostname(host))) {
    return c.text("forbidden host", 400);
  }
  await next();
  c.header("Content-Security-Policy", CSP);
};

/**
 * Defense for write requests. A Content-Type other than JSON can be sent from another site's page
 * without a CORS preflight, so it is refused. If an Origin is present, it must be the same host.
 */
export const guardWrite: MiddlewareHandler = async (c, next) => {
  const type = c.req.header("content-type")?.split(";")[0]?.trim();
  if (type !== "application/json") return c.text("expected application/json", 415);
  const origin = c.req.header("origin");
  if (origin) {
    let ok = false;
    try {
      ok = (ALLOWED_HOSTS as readonly string[]).includes(new URL(origin).hostname);
    } catch {
      ok = false;
    }
    if (!ok) return c.text("cross-origin request refused", 403);
  }
  await next();
};
