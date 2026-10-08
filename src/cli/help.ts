// Help text for the `kairos` command: the overview (with the mascot) and one page per command.
import { version } from "../../package.json";

/** One command's help page. */
interface CommandHelp {
  /** One line, shown in the overview. */
  summary: string;
  /** Longer explanation for the command's own page; the summary is used when absent. */
  description?: string;
  /** Option lines (`--flag <arg>`, explanation) that apply to this command. */
  options?: [string, string][];
  examples?: string[];
}

/** Options shared by the commands that start a server, so they're listed once. */
const SERVER_OPTIONS: [string, string][] = [
  ["--claude-dir <path>", "Claude Code config directory (default: ~/.claude)"],
  ["--db <path>", "DB file (default: under the data directory)"],
  ["--port <n>", "port to listen on (default: 4319)"],
  ["--summary-model <m>", "model used for summaries (default: haiku)"],
  ["--summary-effort <e>", "effort for summaries: low, medium, high, xhigh or max (default: low)"],
  ["--summary-lang <l>", "language of summaries: en or ja (default: the UI's language)"],
  ["--no-auto-summary", "do not summarize automatically (only when requested from the drawer)"],
];

/** Every command, in the order the overview lists them. */
export const COMMANDS: Record<string, CommandHelp> = {
  open: {
    summary: "start the server and open it in the browser",
    options: SERVER_OPTIONS,
  },
  status: { summary: "show the server status", options: [["--port <n>", "port to check"]] },
  stop: { summary: "stop the background server" },
  restart: {
    summary: "stop and start the server again (after updating Kairos)",
    options: SERVER_OPTIONS,
  },
  ensure: {
    summary: "start the server in the background if it is not running",
    description:
      "Start the server in the background if it is not running. Meant for Claude Code's\n" +
      "SessionStart hook: it returns immediately and prints nothing.",
    options: SERVER_OPTIONS,
  },
  serve: { summary: "run the server in the foreground (for development)", options: SERVER_OPTIONS },
  ingest: {
    summary: "import session logs into the DB (incremental after the first run)",
    options: SERVER_OPTIONS.slice(0, 2),
  },
  summarize: {
    summary: "summarize every work block that has no summary yet",
    description:
      "Summarize every finished work block that has no summary yet, newest first, one at a time.\n" +
      "The server only summarizes the last 7 days on its own; this reaches back further.\n" +
      "While the server is running, those 7 days are left to it. When it isn't, the logs are\n" +
      "ingested first so recent sessions are included.\n" +
      "Each summary is saved as soon as it is written, so stopping with Ctrl+C loses nothing\n" +
      "and running it again picks up the rest.",
    options: [
      ["--since <YYYY-MM-DD>", "only blocks that started on or after this day"],
      ["--until <YYYY-MM-DD>", "only blocks that started on or before this day"],
      ["--limit <n>", "at most n blocks (the newest)"],
      ["--dry-run", "show how many blocks would be summarized, without running claude"],
      ["--summary-model <m>", "model used for summaries (default: haiku)"],
      [
        "--summary-effort <e>",
        "effort for summaries: low, medium, high, xhigh or max (default: low)",
      ],
      ["--summary-lang <l>", "language of summaries: en or ja (default: the UI's language)"],
      ["--db <path>", "DB file (default: under the data directory)"],
      [
        "--claude-dir <path>",
        "Claude Code config directory, read when the server is not running (default: ~/.claude)",
      ],
    ],
    examples: [
      "kairos summarize --dry-run",
      "kairos summarize --since 2026-09-01",
      "kairos summarize --limit 20 --summary-lang ja",
    ],
  },
  help: { summary: "show this help, or a command's (kairos help <command>)" },
};

/** Text styles, or no-ops when color is off. */
function styles(color: boolean) {
  const wrap = (code: string) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  return { bold: wrap("1"), dim: wrap("2") };
}

/** Logo width in pixels; a terminal cell is about twice as tall as wide, so it holds two pixels. */
const LOGO_PX = 12;
/** The logo's gradient (dawn → dusk → night), as in `src/web/public/favicon.svg`. */
const DAWN = [0xc4, 0xd0, 0xea];
/** The logo's middle color; the status bar of `kairos summarize` fills in it too. */
export const DUSK = [0xef, 0xc9, 0x8a];
const NIGHT = [0x3a, 0x4a, 0x7c];
/** Where along the gradient dusk sits. */
const DUSK_AT = 0.55;

/**
 * The Kairos mark at a point of its 32×32 SVG canvas: the color there, or null outside it.
 * It's drawn from the same geometry as the favicon (a circle cut by a diagonal blade, each half
 * nudged apart), so the terminal and the browser show one logo.
 */
function logoPixel(x: number, y: number): number[] | null {
  const left = x < 19 - (8 * y) / 32 && (x - 15.2) ** 2 + (y - 16) ** 2 <= 14 ** 2;
  const right = x > 21.6 - (8 * y) / 32 && (x - 16.8) ** 2 + (y - 16) ** 2 <= 14 ** 2;
  if (!left && !right) return null;
  // The SVG gradient runs from (0.3, 0) to (0.7, 1) of the circle's bounding box
  const u = (x - 2) / 28;
  const v = (y - 2) / 28;
  const t = Math.min(1, Math.max(0, ((u - 0.3) * 0.4 + v) / 1.16));
  const [from, to, k] =
    t <= DUSK_AT ? [DAWN, DUSK, t / DUSK_AT] : [DUSK, NIGHT, (t - DUSK_AT) / (1 - DUSK_AT)];
  return from.map((c, j) => Math.round(c + ((to[j] ?? c) - c) * k));
}

/** One terminal cell of the logo: its top and bottom pixel as a half block, in color if allowed. */
function logoCell(top: number[] | null, bottom: number[] | null, color: boolean): string {
  if (!color) return top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ";
  const fg = (c: number[]) => `\x1b[38;2;${c.join(";")}m`;
  const bg = (c: number[]) => `\x1b[48;2;${c.join(";")}m`;
  if (top && bottom) return `${fg(top)}${bg(bottom)}▀\x1b[0m`;
  if (top) return `${fg(top)}▀\x1b[0m`;
  if (bottom) return `${fg(bottom)}▄\x1b[0m`;
  return " ";
}

/** The logo as terminal lines, sampling each pixel's center on the SVG canvas. */
function logoLines(color: boolean): string[] {
  const at = (px: number) => ((px + 0.5) * 32) / LOGO_PX;
  return Array.from({ length: LOGO_PX / 2 }, (_, row) =>
    Array.from({ length: LOGO_PX }, (_, col) =>
      logoCell(logoPixel(at(col), at(row * 2)), logoPixel(at(col), at(row * 2 + 1)), color),
    ).join(""),
  );
}

/** The logo, with the name and version beside it. */
function banner(color: boolean): string {
  const { bold, dim } = styles(color);
  const text = [
    "",
    "",
    `${bold("kairos")} ${dim(`v${version}`)}`,
    dim("Claude Code sessions, on a calendar"),
  ];
  return logoLines(color)
    .map((line, i) => ` ${line}   ${text[i] ?? ""}`.trimEnd())
    .join("\n");
}

/** Option lines aligned in two columns. */
function optionLines(options: [string, string][]): string {
  const width = Math.max(...options.map(([flag]) => flag.length));
  return options.map(([flag, text]) => `  ${flag.padEnd(width)}  ${text}`).join("\n");
}

/** The overview: the mascot, every command, and where to read more. */
export function overview(color: boolean): string {
  const { bold } = styles(color);
  const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length));
  const commands = Object.entries(COMMANDS)
    .map(([name, c]) => `  ${name.padEnd(width)}  ${c.summary}`)
    .join("\n");
  return [
    banner(color),
    "",
    `${bold("usage:")} kairos <command> [options]`,
    "",
    bold("commands:"),
    commands,
    "",
    "Run `kairos help <command>` (or `kairos <command> --help`) for a command's options.",
  ].join("\n");
}

/** A command's own help page, or null when there is no such command. */
export function commandHelp(name: string, color: boolean): string | null {
  const c = COMMANDS[name];
  if (!c) return null;
  const { bold } = styles(color);
  const parts = [
    `${bold("usage:")} kairos ${name}${c.options ? " [options]" : ""}`,
    "",
    c.description ?? `${c.summary[0]?.toUpperCase()}${c.summary.slice(1)}.`,
  ];
  if (c.options) parts.push("", bold("options:"), optionLines(c.options));
  if (c.examples) parts.push("", bold("examples:"), ...c.examples.map((e) => `  ${e}`));
  return parts.join("\n");
}

/** Whether to color output: only on a terminal, and never when NO_COLOR is set. */
export function colorFor(stream: { isTTY?: boolean }): boolean {
  return Boolean(stream.isTTY) && !process.env.NO_COLOR;
}
