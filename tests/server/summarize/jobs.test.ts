import { describe, expect, test } from "bun:test";
import { JobTracker } from "../../../src/server/summarize/jobs.ts";

type Job = { id: string; extra?: number };
const tracker = () => new JobTracker<Job, Pick<Job, "id">>((j) => j.id);

describe("JobTracker", () => {
  test("queues at either end and takes from the front", () => {
    const t = tracker();
    t.pushBack({ id: "b" });
    t.pushFront({ id: "a" });
    t.pushBack({ id: "c" });
    expect(t.length).toBe(3);
    expect([t.take()?.id, t.take()?.id, t.take()?.id, t.take()]).toEqual([
      "a",
      "b",
      "c",
      undefined,
    ]);
  });

  test("counts a job as pending while queued or running, by key", async () => {
    const t = tracker();
    t.pushBack({ id: "a", extra: 1 });
    expect(t.isPending({ id: "a" })).toBe(true);
    t.take();
    expect(t.isPending({ id: "a" })).toBe(false);
    let release = () => {};
    const done = t.track({ id: "a" }, () => new Promise<void>((r) => (release = r)));
    expect(t.isPending({ id: "a" })).toBe(true);
    release();
    await done;
    expect(t.isPending({ id: "a" })).toBe(false);
  });

  test("stops counting a job as running when its work throws", async () => {
    const t = tracker();
    await expect(
      t.track({ id: "a" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(t.isPending({ id: "a" })).toBe(false);
  });

  test("keeps a job's latest failure until it is cleared", () => {
    const t = tracker();
    t.recordFailure({ id: "a" }, new Error("Not logged in"), 0);
    expect(t.errorOf({ id: "a" })).toBe("Not logged in");
    expect(t.isBlocked({ id: "a" }, 0)).toBe(true);
    t.clearFailure({ id: "a" });
    expect(t.errorOf({ id: "a" })).toBeNull();
  });
});
