import type { Database } from "bun:sqlite";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../../src/server/db/index.ts";
import { Ingester } from "../../../src/server/ingest/ingester.ts";
import type { RemoteLookup } from "../../../src/server/ingest/project.ts";

export const T0 = Date.UTC(2026, 8, 28);
/** fixture の基準時刻から n 分後（ミリ秒）。 */
export const min = (n: number) => T0 + n * 60_000;

/**
 * fixture を一時ディレクトリへコピーして取り込む（テストからファイルを書き換えられるように）。
 * git の remote は既定で「なし」とし、手元の実際のディレクトリに左右されないようにする。
 */
export function setup(lookup: RemoteLookup = () => null): {
  db: Database;
  ingester: Ingester;
  projectsDir: string;
} {
  const root = mkdtempSync(join(tmpdir(), "kairos-test-"));
  cpSync(join(import.meta.dir, "../../fixtures/claude"), root, { recursive: true });
  const projectsDir = join(root, "projects");
  const db = openDb(":memory:");
  const ingester = new Ingester(db, projectsDir, undefined, lookup);
  return { db, ingester, projectsDir };
}
