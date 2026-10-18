// What the ⌘K palette offers: every toolbar action as a command with its key, a day when the
// query names one, and which commands a query keeps. Pure, so the list can be tested without a
// DOM; features/palette runs the actions.
import type { Project, SearchHit } from "@shared/api.ts";
import { LANGUAGE_NAMES, LOCALES, type Locale } from "@/i18n/index.ts";
import { paletteMessages } from "@/i18n/messages/palette.ts";
import { toolbarMessages } from "@/i18n/messages/toolbar.ts";
import { parseDateQuery } from "./dateQuery.ts";
import { dateLabel } from "./dates.ts";
import { type Filter, isFiltered } from "./filter.ts";
import { LAYOUTS } from "./layouts.ts";
import { STANDUP_PERIODS, type StandupPeriod, standupPeriodLabel } from "./report.ts";
import type { Shortcut } from "./shortcuts.ts";
import { THEMES, type Theme, themeLabel } from "./themes.ts";
import type { UrlState } from "./urlState.ts";
import type { Layout, View } from "./view.ts";

/** The palette's groups, in the order they are listed. */
export const PALETTE_GROUPS = ["date", "go", "view", "copy", "projects", "settings"] as const;

/** One of `PALETTE_GROUPS`. */
export type PaletteGroup = (typeof PALETTE_GROUPS)[number];

/**
 * What running a command does; features/palette carries it out. A command with a key does what
 * the key does (`shortcut`), so the row teaches the key and the two can't drift apart.
 */
export type PaletteAction =
  | { kind: "shortcut"; shortcut: Shortcut }
  | { kind: "date"; day: number }
  | { kind: "standup"; period: StandupPeriod }
  | { kind: "standupShown" }
  | { kind: "resume" }
  | { kind: "thread" }
  | { kind: "filters" }
  | { kind: "clearFilters" }
  | { kind: "project"; id: number; hidden: boolean }
  | { kind: "allProjects" }
  | { kind: "theme"; theme: Theme }
  | { kind: "locale"; locale: Locale }
  | { kind: "headless"; show: boolean };

/** One row of the palette that isn't a search hit. */
export interface PaletteCommand {
  /** Unique within the list, for React keys and the active row. */
  id: string;
  group: PaletteGroup;
  label: string;
  action: PaletteAction;
}

/** The key a command's row shows: the one that does the same outside the palette, if any. */
export function commandKey(c: PaletteCommand): Shortcut | null {
  return c.action.kind === "shortcut" ? c.action.shortcut : null;
}

/** What the commands depend on: the page, the open block, the filters and the settings. */
export interface PaletteContext {
  now: number;
  layout: Layout;
  view: View;
  /** A block is open, so its session can be resumed. */
  sessionOpen: boolean;
  /** The projects are known, so a report leaves hidden work out; until then nothing is copied. */
  reportReady: boolean;
  /** The page's own period has loaded, so its report can be copied as shown. */
  shownReady: boolean;
  /** Any filter condition is set. */
  filtered: boolean;
  projects: readonly Project[];
  theme: Theme;
  locale: Locale;
  /** Whether headless runs show; null until the settings load. */
  showHeadless: boolean | null;
}

/** A command, built from its action. */
const command = (
  id: string,
  group: PaletteGroup,
  label: string,
  action: PaletteAction,
): PaletteCommand => ({ id, group, label, action });

/** A command doing what `shortcut` does. */
const keyed = (id: string, group: PaletteGroup, label: string, shortcut: Shortcut) =>
  command(id, group, label, { kind: "shortcut", shortcut });

/** Places and layouts: Today, the calendar, Insights and its table, and the open session's thread. */
function goCommands({ sessionOpen }: PaletteContext): PaletteCommand[] {
  const m = toolbarMessages();
  // A thread has no key: it is opened from a session
  const layouts: [Exclude<Layout, "thread">, string][] = [
    ["today", m.home],
    ["calendar", m.calendar],
    ["summary", m.summary],
    ["table", m.shortcutTable],
  ];
  const places = layouts.map(([layout, label]) =>
    keyed(`layout-${layout}`, "go", label, LAYOUTS[layout].shortcut),
  );
  const thread = sessionOpen
    ? [command("thread", "go", paletteMessages().openThread, { kind: "thread" })]
    : [];
  return [...places, ...thread];
}

/** Period lengths, and on a page with a period, moving through it and its blocks. */
function viewCommands({ view, layout }: PaletteContext): PaletteCommand[] {
  const m = toolbarMessages();
  const p = paletteMessages();
  const views: [View, string][] = [
    ["month", m.month],
    ["week", m.week],
    ["day", m.day],
  ];
  const lengths = views.map(([v, name]) => keyed(`view-${v}`, "view", p.viewOf(name), v));
  if (!LAYOUTS[layout].hasPeriod) return lengths;
  return [
    ...lengths,
    keyed("move-prev", "view", m.prev(view), "prevPeriod"),
    keyed("move-next", "view", m.next(view), "nextPeriod"),
    keyed("today", "view", m.shortcutToday, "today"),
    keyed("step-next", "view", p.nextBlock, "nextBlock"),
    keyed("step-prev", "view", p.prevBlock, "prevBlock"),
  ];
}

/** The standup periods, the period on screen, and the open session's resume command. */
function copyCommands({
  layout,
  sessionOpen,
  reportReady,
  shownReady,
}: PaletteContext): PaletteCommand[] {
  const p = paletteMessages();
  // As in the toolbar's menu, reports wait for the projects, not to copy hidden work
  const standups = reportReady
    ? STANDUP_PERIODS.map((period) =>
        command(`standup-${period}`, "copy", p.copyStandup(standupPeriodLabel(period)), {
          kind: "standup",
          period,
        }),
      )
    : [];
  const shown =
    reportReady && shownReady && LAYOUTS[layout].hasPeriod
      ? [command("standup-shown", "copy", p.copyStandupShown, { kind: "standupShown" })]
      : [];
  const resume = sessionOpen ? [command("resume", "copy", p.copyResume, { kind: "resume" })] : [];
  return [...standups, ...shown, ...resume];
}

/** The filters on a page with a period, and showing or hiding each project. */
function projectCommands({ layout, filtered, projects }: PaletteContext): PaletteCommand[] {
  const p = paletteMessages();
  const filters = LAYOUTS[layout].hasPeriod
    ? [
        command("filters", "projects", p.openFilters, { kind: "filters" }),
        ...(filtered
          ? [command("clear-filters", "projects", p.clearFilters, { kind: "clearFilters" })]
          : []),
      ]
    : [];
  const each = projects.map((project) =>
    command(
      `project-${project.id}`,
      "projects",
      project.hidden ? p.showProject(project.name) : p.hideProject(project.name),
      { kind: "project", id: project.id, hidden: !project.hidden },
    ),
  );
  const all = projects.some((project) => project.hidden)
    ? [command("projects-all", "projects", p.showAllProjects, { kind: "allProjects" })]
    : [];
  return [...filters, ...all, ...each];
}

/** The "⋯" menu's settings, each offered as the change it makes, and its shortcut list. */
function settingCommands({ theme, locale, showHeadless }: PaletteContext): PaletteCommand[] {
  const p = paletteMessages();
  const themes = THEMES.filter((t) => t !== theme).map((t) =>
    command(`theme-${t}`, "settings", p.theme(themeLabel(t)), { kind: "theme", theme: t }),
  );
  const locales = LOCALES.filter((l) => l !== locale).map((l) =>
    command(`locale-${l}`, "settings", p.language(LANGUAGE_NAMES[l]), {
      kind: "locale",
      locale: l,
    }),
  );
  const headless =
    showHeadless === null
      ? []
      : [
          command("headless", "settings", p.headless(!showHeadless), {
            kind: "headless",
            show: !showHeadless,
          }),
        ];
  const shortcuts = keyed("shortcuts", "settings", p.shortcuts, "menu");
  return [...themes, ...locales, ...headless, shortcuts];
}

/** Every command the page offers, in group order, before a query narrows them. */
export function paletteCommands(ctx: PaletteContext): PaletteCommand[] {
  return [
    ...goCommands(ctx),
    ...viewCommands(ctx),
    ...copyCommands(ctx),
    ...projectCommands(ctx),
    ...settingCommands(ctx),
  ];
}

/** A group's heading in the palette. */
export function paletteGroupLabel(group: PaletteGroup): string {
  const p = paletteMessages();
  const labels: Record<PaletteGroup, string> = {
    date: p.groupDate,
    go: p.groupGo,
    view: p.groupView,
    copy: p.groupCopy,
    projects: p.groupProjects,
    settings: p.groupSettings,
  };
  return labels[group];
}

/**
 * The commands `query` keeps: those whose label or group holds every word of it, any case. With
 * no query, every command but one per project, which would bury the rest; typing a project's name
 * finds it.
 */
export function matchCommands(
  commands: readonly PaletteCommand[],
  query: string,
): PaletteCommand[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return commands.filter((c) => c.action.kind !== "project");
  return commands.filter((c) => {
    const text = `${c.label} ${paletteGroupLabel(c.group)}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** A row going to the day `query` names (see `parseDateQuery`), or null when it names none. */
export function dateCommand(query: string, now: number): PaletteCommand | null {
  const day = parseDateQuery(query, now);
  if (day === null) return null;
  return command("date", "date", paletteMessages().goToDate(dateLabel(day)), { kind: "date", day });
}

/** The commands the palette lists for `query`: the day it names first, then the ones it keeps. */
export function queryCommands(ctx: PaletteContext, query: string): PaletteCommand[] {
  const date = dateCommand(query, ctx.now);
  return [...(date ? [date] : []), ...matchCommands(paletteCommands(ctx), query)];
}

/**
 * Whether an action leaves the palette open: a copy, so its foot can say how it went. Anything
 * else closes it first and then runs, so the palette's closing doesn't shut what it opens.
 */
export function staysOpen(action: PaletteAction): boolean {
  return action.kind === "standup" || action.kind === "standupShown" || action.kind === "resume";
}

/** Search hits the palette lists under the commands; the search field's panel has the rest. */
export const PALETTE_HITS = 8;

/** One row of the palette: a command, or a block a search found. */
export type PaletteRow =
  | { kind: "command"; command: PaletteCommand }
  | { kind: "hit"; hit: SearchHit };

/** The palette's rows: the kept commands in group order, then the first `PALETTE_HITS` hits. */
export function paletteRows(
  commands: readonly PaletteCommand[],
  hits: readonly SearchHit[],
): PaletteRow[] {
  return [
    ...commands.map((command) => ({ kind: "command", command }) as const),
    ...hits.slice(0, PALETTE_HITS).map((hit) => ({ kind: "hit", hit }) as const),
  ];
}

/** A row's id, unique in the list, for React keys and the input's active descendant. */
export function paletteRowId(row: PaletteRow): string {
  return row.kind === "command"
    ? `palette-${row.command.id}`
    : `palette-hit-${row.hit.sessionId}-${row.hit.start}`;
}

/** The active row kept within the list, which can shrink under it as the query narrows. */
export function clampRow(active: number, count: number): number {
  return Math.min(active, count - 1);
}

/** The row a step of ↑ / ↓ lands on, wrapping around at either end; -1 for an empty list. */
export function stepRow(active: number, count: number, dir: -1 | 1): number {
  if (count === 0) return -1;
  return (clampRow(active, count) + dir + count) % count;
}

/** A run of rows under one heading: a command group, or the work search found. */
export interface PaletteSection {
  key: PaletteGroup | "work";
  rows: PaletteRow[];
}

/** The rows split into sections by their group, in order (`paletteRows` keeps groups together). */
export function paletteSections(rows: readonly PaletteRow[]): PaletteSection[] {
  const sections: PaletteSection[] = [];
  for (const row of rows) {
    const key = row.kind === "command" ? row.command.group : "work";
    const last = sections.at(-1);
    if (last?.key === key) last.rows.push(row);
    else sections.push({ key, rows: [row] });
  }
  return sections;
}

/** What `paletteContext` reads the palette's context from. */
export interface PaletteInputs {
  now: number;
  state: Pick<UrlState, "layout" | "view" | "session">;
  filter: Filter;
  projects: readonly Project[];
  theme: Theme;
  locale: Locale;
  showHeadless: boolean | null;
  reportReady: boolean;
  shownReady: boolean;
}

/** The palette's context from the page's state, the filter and the settings. */
export function paletteContext({ state, filter, ...rest }: PaletteInputs): PaletteContext {
  return {
    ...rest,
    layout: state.layout,
    view: state.view,
    sessionOpen: state.session !== null,
    filtered: isFiltered(filter),
  };
}
