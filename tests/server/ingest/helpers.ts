import type { Database } from "bun:sqlite";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../../src/server/db/index.ts";
import { Ingester } from "../../../src/server/ingest/ingester.ts";

export const T0 = Date.UTC(2026, 8, 28);
/** fixture の基準時刻から n 分後（ミリ秒）。 */
export const min = (n: number) => T0 + n * 60_000;

/** fixture を一時ディレクトリへコピーして取り込む（テストからファイルを書き換えられるように）。 */
export function setup(): { db: Database; ingester: Ingester; projectsDir: string } {
  const root = mkdtempSync(join(tmpdir(), "kairos-test-"));
  cpSync(join(import.meta.dir, "../../fixtures/claude"), root, { recursive: true });
  const projectsDir = join(root, "projects");
  const db = openDb(":memory:");
  const ingester = new Ingester(db, projectsDir);
  return { db, ingester, projectsDir };
}
