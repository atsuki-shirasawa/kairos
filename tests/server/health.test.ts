import { expect, test } from "bun:test";
import { createApp } from "../../src/server/api/app.ts";
import type { HealthResponse } from "../../src/shared/api.ts";

test("GET /api/health は起動確認用の応答を返す", async () => {
  const res = await createApp().request("/api/health");
  expect(res.status).toBe(200);
  const body = (await res.json()) as HealthResponse;
  expect(body).toMatchObject({ ok: true, name: "kairos" });
});
