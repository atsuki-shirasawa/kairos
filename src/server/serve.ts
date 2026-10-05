import { existsSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "hono/bun";
import { HOST, PORT } from "../shared/constants.ts";
import { createApp } from "./api/app.ts";

const WEB_DIST = join(import.meta.dir, "../../dist/web");

export function serve(port = PORT): ReturnType<typeof Bun.serve> {
  const app = createApp();
  // ビルド済みの Web があれば配信する。開発中は Vite が配信し、/api だけここへプロキシされる。
  if (existsSync(WEB_DIST)) {
    // 画面は / だけ（状態はクエリで持つ）なので、SPA 用のフォールバックは置かない。
    app.use("/*", serveStatic({ root: WEB_DIST }));
  }
  const server = Bun.serve({ hostname: HOST, port, fetch: app.fetch });
  console.log(`kairos: serving http://${HOST}:${server.port}/`);
  return server;
}
