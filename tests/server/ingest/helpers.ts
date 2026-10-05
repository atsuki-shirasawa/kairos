import type { Database } from "bun:sqlite";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../../src/server/db/index.ts";
import { Ingester } from "../../../src/server/ingest/ingester.ts";
import type { RemoteLookup } from "../../../src/server/ingest/project.ts";

export const T0 = Date.UTC(2026, 8, 28);
/** n minutes after the fixture's base time (ms). */
export const min = (n: number) => T0 + n * 60_000;

/**
 * Copies the fixtures to a temp directory and ingests them (so tests can modify the files).
 * git remotes default to none, so results do not depend on real local directories.
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
