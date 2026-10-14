// Help text for the `kairos` command: the overview (with the mascot) and one page per command.
import { version } from "../../package.json";
import { MAX_WIDTH, optionText, styleFlag, twoColumns } from "./layout.ts";
import { logoLines } from "./logo.ts";
import { flagLabel, OPTIONS, type OptionName } from "./options.ts";
import { styles, wrapWords } from "./style.ts";

/** The overview's sections, in the order it shows them. */
const GROUPS = ["Browse", "Server", "Data", "Troubleshoot"] as const;

/**
 * An option a command takes: its name, with the explanation from `OPTIONS`, or the name and an
 * explanation of its own when the option means something narrower for this command.
 */
type OptionLine = OptionName | readonly [OptionName, string];

/** One command's help page, and the options and arguments it accepts. */
export interface CommandHelp {
  /** The overview section it's listed under. */
  group: (typeof GROUPS)[number];
  /** One line, shown in the overview. */
  summary: string;
  /** Longer explanation for the command's own page; the summary is used when absent. */
  description?: string;
  /** The arguments it takes, as the usage line shows them (`[day]`); it takes none when absent. */
  args?: string;
  /** The options that apply to this command, in the order its page lists them; any other is refused. */
  options?: readonly OptionLine[];
  examples?: string[];
}

/** Options shared by the commands that start a server, so they're listed once. */
const SERVER_OPTIONS: readonly OptionLine[] = [
  "claude-dir",
  "db",
  "port",
  "summary-model",
  "summary-effort",
  "summary-lang",
  "no-auto-summary",
];

/** `--claude-dir` for the commands that read the DB: only read when no server keeps it current. */
const READ_CLAUDE_DIR: OptionLine = [
  "claude-dir",
  "Claude Code config directory, read when the server is not running (default: ~/.claude)",
];

/** Options of the commands that read the DB, catching up on the logs first when the server is down. */
const READ_OPTIONS: readonly OptionLine[] = [
  "json",
  "db",
  READ_CLAUDE_DIR,
  ["port", "port of the server, for links (default: 4319)"],
];

/** Every command; the overview lists them by group, in this order within each. */
export const COMMANDS: Record<string, CommandHelp> = {
  open: {
    group: "Browse",
    summary: "start the server and open it in the browser",
    description:
      "Start the server if it is not running and open it in the browser: this week, or the day\n" +
      "given (YYYY-MM-DD, today or yesterday).",
    args: "[day]",
    options: ["session", ...SERVER_OPTIONS],
    examples: ["kairos open", "kairos open yesterday", "kairos open 2026-10-01"],
  },
  status: {
    group: "Server",
    summary: "show the server status",
    options: [["port", "port to check"]],
  },
  stop: { group: "Server", summary: "stop the background server" },
  restart: {
    group: "Server",
    summary: "stop and start the server again (after updating Kairos)",
    description:
      "Stop the server and start it again. It keeps the options the running server was started\n" +
      "with, unless you give server options, which replace them. --port is never kept: give it\n" +
      "again if the server isn't on the default port.",
    options: SERVER_OPTIONS,
  },
  rebuild: {
    group: "Server",
    summary: "build the web UI and restart the server (after changing Kairos)",
    description:
      "Build the web UI (`bun run build` in the repository), then restart the server so it\n" +
      "serves the new build and code. If the build fails, the running server is left alone.",
    options: SERVER_OPTIONS,
  },
  ensure: {
    group: "Server",
    summary: "start the server in the background if it is not running",
    description:
      "Start the server in the background if it is not running. Meant for Claude Code's\n" +
      "SessionStart hook: it returns immediately and prints nothing.",
    options: SERVER_OPTIONS,
  },
  serve: {
    group: "Server",
    summary: "run the server in the foreground (for development)",
    options: SERVER_OPTIONS,
  },
  ingest: {
    group: "Data",
    summary: "import session logs into the DB (incremental after the first run)",
    options: ["claude-dir", "db"],
  },
  summarize: {
    group: "Data",
    summary: "summarize every work block that has no summary yet",
    description:
      "Summarize every finished work block that has no summary yet, newest first, one at a time.\n" +
      "The server only summarizes the last 7 days on its own; this reaches back further.\n" +
      "While the server is running, those 7 days are left to it. When it isn't, the logs are\n" +
      "ingested first so recent sessions are included.\n" +
      "Each summary is saved as soon as it is written, so stopping with Ctrl+C loses nothing\n" +
      "and running it again picks up the rest.",
    options: [
      ["since", "only blocks that started on or after this day (YYYY-MM-DD)"],
      ["until", "only blocks that started on or before this day"],
      ["limit", "at most n blocks (the newest)"],
      "dry-run",
      "summary-model",
      "summary-effort",
      "summary-lang",
      "db",
      READ_CLAUDE_DIR,
      ["port", "port of the running server, whose recent blocks are left to it"],
    ],
    examples: [
      "kairos summarize --dry-run",
      "kairos summarize --since 2026-09-01",
      "kairos summarize --limit 20 --summary-lang ja",
    ],
  },
  report: {
    group: "Browse",
    summary: "print a day's or a period's work as Markdown",
    description:
      "Print the work blocks of a day (default: today) or of --since / --until as Markdown, per\n" +
      "day and project, like the report the UI copies, followed by what was still open at the\n" +
      "end. Paste it into a stand-up note, Slack or a ticket.",
    args: "[day]",
    options: ["since", "until", "full", ...READ_OPTIONS],
    examples: [
      "kairos report",
      "kairos report yesterday --full",
      "kairos report --since 2026-10-06 --until 2026-10-10 | pbcopy",
    ],
  },
  "open-items": {
    group: "Browse",
    summary: "list what is still open, per project",
    description:
      "List the open items (todos, issues, questions, waits) that summaries left and nothing has\n" +
      "closed yet, grouped by project.",
    options: ["project", ...READ_OPTIONS],
    examples: ["kairos open-items", "kairos open-items --project ."],
  },
  search: {
    group: "Browse",
    summary: "find work blocks by what was done in them",
    description:
      "Find work blocks matching every term, newest first: in summaries, session titles,\n" +
      "branches, PR and commit titles, and the conversation. `file:<path>` matches files edited\n" +
      "in the block. Each hit comes with a link that opens it in Kairos.",
    args: "<terms...>",
    options: ["limit", ...READ_OPTIONS],
    examples: ["kairos search migration", "kairos search file:src/cli/index.ts"],
  },
  doctor: {
    group: "Troubleshoot",
    summary: "check the setup: claude, the build, the server, the DB and the hook",
    description:
      "Check what the README's troubleshooting table checks by hand: the session logs, the\n" +
      "`claude` command, the web build, the server (and who holds the port if it isn't Kairos),\n" +
      "the DB, the SessionStart hook, and Claude Code's record of running sessions. Exits 1 when\n" +
      "something is broken.",
    options: [["port", "port to check (default: 4319)"], "db", "claude-dir"],
  },
  logs: {
    group: "Troubleshoot",
    summary: "show the end of the server log",
    options: ["lines", "follow"],
  },
  help: {
    group: "Troubleshoot",
    summary: "show this help, or a command's (kairos help <command>)",
    args: "[command]",
  },
};

/** An option line's name. */
function lineName(line: OptionLine): OptionName {
  return typeof line === "string" ? line : line[0];
}

/** An option line's explanation: the command's own, or the option's. */
function lineText(line: OptionLine): string {
  return typeof line === "string" ? OPTIONS[line].help : line[1];
}

/** The options a command takes, by name; any other given to it is refused. */
export function optionNames(command: CommandHelp): OptionName[] {
  return (command.options ?? []).map(lineName);
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

/**
 * The overview: the mascot, every command by group, and where to read more. Summaries wrap to
 * `columns` (the terminal's width).
 */
export function overview(color: boolean, columns = MAX_WIDTH): string {
  const s = styles(color);
  // One name column across every group, so the sections line up
  const nameWidth = Math.max(...Object.keys(COMMANDS).map((name) => name.length));
  const groups = GROUPS.flatMap((group) => [
    "",
    s.heading(`${group}:`),
    twoColumns(
      Object.entries(COMMANDS)
        .filter(([, c]) => c.group === group)
        .map(([name, c]) => ({ name, styled: s.command(name), text: c.summary })),
      columns,
      wrapWords,
      nameWidth,
    ),
  ]);
  return [
    banner(color),
    "",
    `${s.heading("Usage:")} kairos ${s.command("<command>")} ${s.dim("[options]")}`,
    ...groups,
    "",
    ...wrapWords(
      "Run kairos help <command> or kairos <command> --help for its options.",
      Math.min(columns, MAX_WIDTH),
    ).map((line) => line.replace(/kairos (help <command>|<command> --help)/g, (m) => s.command(m))),
  ].join("\n");
}

/**
 * A command's own help page, or null when there is no such command. Text wraps to `columns` (the
 * terminal's width; capped so lines stay readable).
 */
export function commandHelp(name: string, color: boolean, columns = MAX_WIDTH): string | null {
  const c = COMMANDS[name];
  if (!c) return null;
  const s = styles(color);
  const args = c.args ? ` ${c.args}` : "";
  // Descriptions are broken by hand only to keep the source readable, so reflow them as one paragraph
  const description = c.description ?? `${c.summary[0]?.toUpperCase()}${c.summary.slice(1)}.`;
  const parts = [
    `${s.heading("Usage:")} kairos ${s.command(name)}${args}${c.options ? ` ${s.dim("[options]")}` : ""}`,
    "",
    ...wrapWords(description, Math.min(columns, MAX_WIDTH)),
  ];
  if (c.options)
    parts.push(
      "",
      s.heading("Options:"),
      twoColumns(
        c.options.map((line) => {
          const flag = flagLabel(lineName(line));
          return { name: flag, styled: styleFlag(flag, s), text: lineText(line) };
        }),
        columns,
        (text, width) => optionText(text, width, s),
      ),
    );
  if (c.examples)
    parts.push("", s.heading("Examples:"), ...c.examples.map((e) => `  ${s.dim("$")} ${e}`));
  return parts.join("\n");
}
