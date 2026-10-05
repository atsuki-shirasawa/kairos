import { expect, test } from "bun:test";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { watchProjects } from "../../src/server/ingest/watcher.ts";
import { SID } from "../fixtures/ids.ts";
import { setup } from "./ingest/helpers.ts";

test("ingests appended lines and reports the changed sessions", async () => {
  const { db, ingester, projectsDir } = setup();
  ingester.scan();
  const changed = new Promise<string[]>((resolve) => {
    const stop = watchProjects(ingester, (ids) => {
      stop();
      resolve(ids);
    });
  });
  await Bun.sleep(100); // wait for the watcher to start
  const record = {
    type: "user",
    uuid: "watch-1",
    sessionId: SID.blog,
    timestamp: "2026-09-29T02:00:00.000Z",
    origin: { kind: "human" },
    message: { role: "user", content: "追記" },
  };
  appendFileSync(
    join(projectsDir, "-Users-me-dev-blog", `${SID.blog}.jsonl`),
    `${JSON.stringify(record)}\n`,
  );
  const ids = await Promise.race([changed, Bun.sleep(5000).then(() => [] as string[])]);
  expect(ids).toEqual([SID.blog]);
  const n = db
    .query<{ n: number }, [string]>("SELECT prompt_count AS n FROM sessions WHERE id = ?")
    .get(SID.blog)?.n;
  expect(n).toBe(2);
});
