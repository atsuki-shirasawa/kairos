// A status bar pinned to the bottom of the terminal for long CLI runs (`kairos summarize`): log
// lines scroll above it while it keeps redrawing the count, the time left and what is running now.
import { DUSK } from "./help.ts";

/** Spinner frames, advanced on every redraw so the bar shows it is alive during a slow `claude -p`. */
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
/** How often the bar redraws while waiting. */
const TICK_MS = 100;
/** Bar width in cells; it shrinks on narrow terminals. */
const BAR_CELLS = 24;
/** Eighths of a cell, so the bar moves smoothly instead of a whole cell at a time. */
const PARTIAL = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];

/** Everything one frame of the status bar shows. */
export interface BarState {
  done: number;
  total: number;
  failed: number;
  /** ms since the run started, for the time left. */
  elapsedMs: number;
  /** What is running now, e.g. `2026-09-28 11:16  kairos`; empty between items. */
  current: string;
  /** Spinner frame counter. */
  frame: number;
}

/** `1h 05m`, `12m 30s` or `45s`. */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${s}s`;
}

/** The bar itself: filled cells, a partial cell, then the empty track. */
function bar(ratio: number, cells: number, color: boolean): string {
  const eighths = Math.round(Math.min(1, Math.max(0, ratio)) * cells * 8);
  const full = Math.floor(eighths / 8);
  const partial = PARTIAL[eighths % 8] ?? "";
  const filled = "█".repeat(full) + partial;
  const empty = " ".repeat(cells - full - (partial ? 1 : 0));
  if (!color) return `[${filled}${empty.replaceAll(" ", "·")}]`;
  // The logo's dusk on a dim track, so the bar matches the banner in `kairos help`
  return `\x1b[38;2;${DUSK.join(";")};48;5;236m${filled}${empty}\x1b[0m`;
}

/**
 * One frame of the status bar, fitted to `columns` so it never wraps (a wrapped line can't be
 * redrawn in place). The time left is extrapolated from the average so far, once there is one.
 */
export function renderBar(state: BarState, columns: number, color: boolean): string {
  const { done, total, failed, elapsedMs } = state;
  const dim = (s: string) => (color ? `\x1b[2m${s}\x1b[0m` : s);
  const red = (s: string) => (color ? `\x1b[31m${s}\x1b[0m` : s);
  const spinner = done < total ? (SPINNER[state.frame % SPINNER.length] ?? "") : "✓";
  const percent = `${String(Math.floor((done / Math.max(1, total)) * 100)).padStart(3)}%`;
  const count = `${String(done).padStart(String(total).length)}/${total}`;
  const left =
    done > 0 && done < total ? `~${formatDuration((elapsedMs / done) * (total - done))} left` : "";
  const stats = (withLeft: boolean) =>
    [count, percent, failed > 0 ? red(`${failed} failed`) : "", withLeft ? dim(left) : ""]
      .filter(Boolean)
      .join("  ");
  const ratio = done / Math.max(1, total);
  const compose = (cells: number, withLeft: boolean) =>
    [spinner, cells > 0 ? bar(ratio, cells, color) : "", stats(withLeft)].filter(Boolean).join(" ");
  // Narrow terminal: shrink the bar first, then drop the time left, then the bar itself
  const fits = (text: string) => Bun.stringWidth(text) < columns;
  const fitted = (withLeft: boolean) => {
    // The bar takes its cells, a separating space, and brackets when it has no color to show the track
    const room = columns - 1 - Bun.stringWidth(compose(0, withLeft)) - 1 - (color ? 0 : 2);
    const cells = Math.min(BAR_CELLS, room);
    return cells >= 4 ? compose(cells, withLeft) : null;
  };
  const line = fitted(true) ?? fitted(false) ?? compose(0, fits(compose(0, true)));
  const currentRoom = columns - 1 - Bun.stringWidth(line) - 2;
  if (!state.current || currentRoom < 8) return line;
  return `${line}  ${dim(truncate(state.current, currentRoom))}`;
}

/** Cuts text to `width` terminal cells, marking the cut with an ellipsis. */
function truncate(text: string, width: number): string {
  if (Bun.stringWidth(text) <= width) return text;
  let out = "";
  for (const ch of text) {
    if (Bun.stringWidth(`${out}${ch}…`) > width) break;
    out += ch;
  }
  return `${out}…`;
}

/** The writable side of a terminal, as much of it as the status bar uses. */
interface Terminal {
  isTTY?: boolean;
  columns?: number;
  write(text: string): unknown;
}

/**
 * Keeps a status bar on the last line of a terminal. `log` prints a line above it. On anything
 * but a terminal it draws nothing and `log` just prints, so piped output stays plain lines.
 */
export class StatusBar {
  private readonly started = performance.now();
  private readonly state: BarState;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly out: Terminal,
    total: number,
    private readonly color: boolean,
  ) {
    this.state = { done: 0, total, failed: 0, elapsedMs: 0, current: "", frame: 0 };
    if (this.live) this.timer = setInterval(() => this.draw(), TICK_MS);
  }

  private get live(): boolean {
    return Boolean(this.out.isTTY);
  }

  /** Shows what is being worked on now. */
  begin(current: string): void {
    this.state.current = current;
    this.draw();
  }

  /** Counts one item as finished. */
  advance(failed: boolean): void {
    this.state.done++;
    if (failed) this.state.failed++;
    this.state.current = "";
    this.draw();
  }

  /** Prints a line above the bar. */
  log(line: string): void {
    if (!this.live) {
      this.out.write(`${line}\n`);
      return;
    }
    this.out.write(`\r\x1b[2K${line}\n`);
    this.draw();
  }

  /** Stops redrawing and removes the bar, leaving the terminal as if it was never there. */
  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.live) this.out.write("\r\x1b[2K");
  }

  private draw(): void {
    if (!this.live) return;
    this.state.frame++;
    this.state.elapsedMs = performance.now() - this.started;
    this.out.write(`\r\x1b[2K${renderBar(this.state, this.out.columns ?? 80, this.color)}`);
  }
}
