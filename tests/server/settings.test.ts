import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "../../src/server/api/app.ts";
import { EventHub } from "../../src/server/events.ts";
import { Summarizer } from "../../src/server/summarize/summarizer.ts";
import type { Settings } from "../../src/shared/api.ts";
import { SID } from "../fixtures/ids.ts";
import { min, setup } from "./ingest/helpers.ts";

const URL_BASE = "http://127.0.0.1:4319";
let db: Database;
let prompts: string[];

beforeEach(() => {
  const s = setup();
  s.ingester.scan();
  db = s.db;
  prompts = [];
});

const summarizer = (lang?: "en" | "ja") =>
  new Summarizer(
    db,
    async (p) => {
      prompts.push(p);
      return "Headline\n\n- Goal: x";
    },
    lang ? { lang } : {},
  );

const patch = (app: ReturnType<typeof createApp>, body: unknown, headers = {}) =>
  app.request(`${URL_BASE}/api/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("summary language", () => {
  test("follows the language the UI stored, and applies to the next summary", async () => {
    const s = summarizer();
    const app = createApp({ db, events: new EventHub(), summarizer: s });
    expect((await (await app.request(`${URL_BASE}/api/settings`)).json()) as Settings).toEqual({
      summaryLang: "en",
      summaryLangFixed: false,
    });

    const res = await patch(app, { summaryLang: "ja" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Settings).summaryLang).toBe("ja");
    expect(s.lang).toBe("ja");

    await s.summarize({ sessionId: SID.basic, start: min(0) });
    expect(prompts[0]).toContain("Japanese");
  });

  test("--summary-lang wins over the UI's choice", async () => {
    const s = summarizer("en");
    const app = createApp({ db, events: new EventHub(), summarizer: s });
    await patch(app, { summaryLang: "ja" });
    expect(s.lang).toBe("en");
    expect((await (await app.request(`${URL_BASE}/api/settings`)).json()) as Settings).toEqual({
      summaryLang: "en",
      summaryLangFixed: true,
    });
  });

  test("the choice survives a restart", async () => {
    await patch(createApp({ db, events: new EventHub(), summarizer: summarizer() }), {
      summaryLang: "ja",
    });
    expect(summarizer().lang).toBe("ja");
  });

  test("rejects invalid values and cross-site writes", async () => {
    const app = createApp({ db, events: new EventHub(), summarizer: summarizer() });
    expect((await patch(app, { summaryLang: "fr" })).status).toBe(400);
    expect((await patch(app, "ja")).status).toBe(400);
    expect(
      (await patch(app, { summaryLang: "ja" }, { origin: "https://evil.example" })).status,
    ).toBe(403);
    expect(summarizer().lang).toBe("en");
  });
});
