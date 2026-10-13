import { type FSWatcher, watch } from "node:fs";
import { LivenessCheck, type RegistryEntry, readRegistry } from "./registry.ts";

const DEBOUNCE_MS = 200;
/**
 * A process that dies without cleaning up changes no file, so the registry is also read on this
 * interval; it is a directory listing and a handful of small files.
 */
const POLL_MS = 5_000;

/**
 * Keeps the set of running Claude Code sessions current from the registry directory and calls
 * `onChange` when it changes: a session starting or ending, or one switching between busy and idle.
 */
export class LiveTracker {
  private current: RegistryEntry[] = [];
  private signature = "";
  private readable = false;

  constructor(
    private readonly dir: string,
    private readonly onChange: () => void,
    private readonly liveness = new LivenessCheck(),
  ) {}

  /** Running sessions as of the last read. */
  entries(): RegistryEntry[] {
    return this.current;
  }

  /** Whether the registry directory could be read at all. */
  get available(): boolean {
    return this.readable;
  }

  /** Reads the registry now; calls `onChange` if what is running changed since the last read. */
  refresh(): void {
    const all = readRegistry(this.dir);
    this.readable = all !== null;
    this.liveness.retain(all ?? []);
    const running = (all ?? []).filter((e) => this.liveness.isRunning(e));
    running.sort((a, b) => a.startedAt - b.startedAt || a.pid - b.pid);
    const signature = JSON.stringify(
      running.map((e) => [e.pid, e.sessionId, e.status, e.statusUpdatedAt, e.name]),
    );
    this.current = running;
    if (signature === this.signature) return;
    this.signature = signature;
    this.onChange();
  }

  /** Reads once, then follows the directory. Returns a function that stops following it. */
  start(): () => void {
    this.refresh();
    let timer: Timer | null = null;
    const schedule = () => {
      timer ??= setTimeout(() => {
        timer = null;
        this.refresh();
      }, DEBOUNCE_MS);
    };
    let watcher: FSWatcher | null = null;
    try {
      watcher = watch(this.dir, schedule);
    } catch {
      // No registry directory (yet): polling notices when one appears
    }
    const poll = setInterval(() => this.refresh(), POLL_MS);
    return () => {
      watcher?.close();
      clearInterval(poll);
      if (timer) clearTimeout(timer);
    };
  }
}
