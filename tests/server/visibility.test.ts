import { expect, test } from "bun:test";
import { openDb } from "../../src/server/db/index.ts";
import { storeShowHeadless } from "../../src/server/settings.ts";
import { currentVisibility, DEFAULT_HIDDEN_CWDS } from "../../src/server/visibility.ts";

test("currentVisibility follows the stored headless choice and hides Kairos's own runs by default", () => {
  const db = openDb(":memory:");
  expect(currentVisibility(db)).toEqual({ headless: false, hiddenCwds: DEFAULT_HIDDEN_CWDS });
  storeShowHeadless(db, true);
  expect(currentVisibility(db, ["/hidden"])).toEqual({ headless: true, hiddenCwds: ["/hidden"] });
});
