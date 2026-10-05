import type { MiddlewareHandler } from "hono";
import { ALLOWED_HOSTS } from "../../shared/constants.ts";

/**
 * 外部のリソースを一切読み込ませない。会話ログには任意の URL を指す Markdown や HTML が含まれうるため、
 * 表示しただけで外部と通信しないようにする。
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
  // [::1]:4319 のような IPv6 表記は扱わない（待ち受けは 127.0.0.1 のみ）
  return host.replace(/:\d+$/, "");
}

/** Host ヘッダがループバック以外なら拒否する（DNS rebinding 対策）。全レスポンスに CSP を付ける。 */
export const guardHost: MiddlewareHandler = async (c, next) => {
  // Bun.serve では URL も Host ヘッダから組み立てられる。ヘッダがないとき（テスト）は URL を見る。
  const host = c.req.header("host") ?? new URL(c.req.url).host;
  if (!(ALLOWED_HOSTS as readonly string[]).includes(hostname(host))) {
    return c.text("forbidden host", 400);
  }
  await next();
  c.header("Content-Security-Policy", CSP);
};

/**
 * 書き込み系のリクエストの防御。JSON 以外の Content-Type は、別サイトのページから CORS の
 * プリフライトなしで送れてしまうので受け付けない。Origin が付いていれば同じホストに限る。
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
