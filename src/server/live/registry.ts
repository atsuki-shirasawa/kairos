// Claude Code's session registry: `<claudeDir>/sessions/<pid>.json`, one file per running process,
// rewritten when its status changes. Undocumented, so every field is checked and anything
// unexpected is skipped rather than trusted. Only `*.json` is read: the `.key` files beside them
// are credentials for messaging other sessions and are never opened.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** One running Claude Code process, as the registry records it. */
export interface RegistryEntry {
  pid: number;
  sessionId: string;
  cwd: string;
  /** `interactive` for a terminal session, `bg` for a background one; other values may appear. */
  kind: string;
  /** `busy` while a turn runs, `idle` between turns; other values may appear. */
  status: string;
  statusUpdatedAt: number;
  startedAt: number;
  /** The process start time as `ps -o lstart` prints it in UTC, to tell a reused PID apart. */
  procStart: string | null;
  name: string | null;
}

/** Session IDs are UUIDs; anything else is not a session this registry format describes. */
const SESSION_ID_RE = /^[0-9a-f-]{8,64}$/i;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null;

/** Validates one registry file's JSON; null when a field Kairos relies on is missing or odd. */
export function parseEntry(json: unknown): RegistryEntry | null {
  if (typeof json !== "object" || json === null) return null;
  const r = json as Record<string, unknown>;
  const pid = int(r.pid);
  const sessionId = str(r.sessionId);
  const cwd = str(r.cwd);
  const status = str(r.status);
  if (pid === null || !sessionId || !SESSION_ID_RE.test(sessionId) || !cwd || !status) return null;
  const startedAt = int(r.startedAt) ?? 0;
  return {
    pid,
    sessionId,
    cwd,
    kind: str(r.kind) ?? "interactive",
    status,
    statusUpdatedAt: int(r.statusUpdatedAt) ?? int(r.updatedAt) ?? startedAt,
    startedAt,
    procStart: str(r.procStart),
    name: str(r.name),
  };
}

/**
 * Every entry in the registry directory, running or not. null when the directory can't be read
 * (an older Claude Code, or a different config directory), so the UI can say live status is off.
 */
export function readRegistry(dir: string): RegistryEntry[] | null {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  const entries: RegistryEntry[] = [];
  for (const name of names) {
    if (!/^\d+\.json$/.test(name)) continue;
    try {
      const entry = parseEntry(JSON.parse(readFileSync(join(dir, name), "utf8")));
      if (entry) entries.push(entry);
    } catch {
      // Being rewritten, or removed as the process exits; the next read picks it up
    }
  }
  return entries;
}

/** Whether a process with this PID exists (EPERM means it does, owned by someone else). */
export function pidExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The start time of a process as `ps -o lstart` prints it in UTC, or null when ps can't tell. */
export function processStart(pid: number): string | null {
  try {
    const out = Bun.spawnSync(["ps", "-o", "lstart=", "-p", String(pid)], {
      env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
    });
    const text = normalizeSpaces(out.stdout.toString());
    return out.exitCode === 0 && text ? text : null;
  } catch {
    return null;
  }
}

function normalizeSpaces(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * Tells which registry entries belong to processes still running. A file left behind by a
 * process that died without cleaning up may name a PID the system has since given to another
 * process, so a living PID also has to have started when the entry says. That takes a `ps` call,
 * made once per entry and remembered while the entry is in the registry.
 */
export class LivenessCheck {
  private readonly verified = new Map<string, boolean>();

  constructor(
    private readonly exists: (pid: number) => boolean = pidExists,
    private readonly startOf: (pid: number) => string | null = processStart,
  ) {}

  /** Whether the entry's process is the one running under its PID now. */
  isRunning(entry: RegistryEntry): boolean {
    if (!this.exists(entry.pid)) return false;
    // Without a recorded start time, the PID's existence is all there is to go on
    if (entry.procStart === null) return true;
    const key = keyOf(entry);
    const known = this.verified.get(key);
    if (known !== undefined) return known;
    const actual = this.startOf(entry.pid);
    // ps failing says nothing either way; trust the PID this time and ask again next time
    if (actual === null) return true;
    const same = actual === normalizeSpaces(entry.procStart);
    this.verified.set(key, same);
    return same;
  }

  /** Forgets entries no longer in the registry, so a long-running server doesn't collect them. */
  retain(entries: readonly RegistryEntry[]): void {
    const keep = new Set(entries.map(keyOf));
    for (const key of this.verified.keys()) if (!keep.has(key)) this.verified.delete(key);
  }
}

function keyOf(entry: RegistryEntry): string {
  return `${entry.pid}:${entry.procStart}`;
}
