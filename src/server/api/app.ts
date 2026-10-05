import { Hono } from "hono";
import { version } from "../../../package.json";
import type { HealthResponse } from "../../shared/api.ts";

export function createApp(): Hono {
  const app = new Hono();

  app.get("/api/health", (c) => c.json<HealthResponse>({ ok: true, name: "kairos", version }));

  return app;
}
