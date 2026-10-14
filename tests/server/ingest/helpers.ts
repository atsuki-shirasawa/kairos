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

/** The container checkout of scenario 20, which doesn't exist on the machine reading the logs. */
export const GONE_DIRS: ReadonlySet<string> = new Set(["/work/checkout"]);

/**
 * Stand-in for reading git remotes: every directory exists without a remote, except `GONE_DIRS`.
 * Results then don't depend on real local directories.
 */
export const noRemotes: RemoteLookup = (dir) => (GONE_DIRS.has(dir) ? undefined : null);

/** Copies the fixtures to a temp directory and ingests them (so tests can modify the files). */
export function setup(lookup: RemoteLookup = noRemotes): {
  db: Database;
  ingester: Ingester;
  projectsDir: string;
} {
  const root = mkdtempSync(join(tmpdir(), "kairos-test-"));
  cpSync(join(import.meta.dir, "../../fixtures/claude"), root, { recursive: true });
  const projectsDir = join(root, "projects");
  const db = openDb(":memory:");
  const ingester = new Ingester(db, projectsDir, { lookupRemote: lookup });
  return { db, ingester, projectsDir };
}
