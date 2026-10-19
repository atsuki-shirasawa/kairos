import type { Project } from "@shared/api.ts";
import { useQueryClient } from "@tanstack/react-query";
import {
  sessionQuery,
  useShowAllProjects,
  useShowTrials,
  useUpdateProject,
} from "@/hooks/queries.ts";
import { type CopyState, useCopy } from "@/hooks/useCopy.ts";
import { useStandupReport } from "@/hooks/useStandupReport.ts";
import { setLocale } from "@/i18n/index.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { paletteMessages } from "@/i18n/messages/palette.ts";
import { clearedFilter, type Filter } from "@/lib/filter.ts";
import { LAYOUTS } from "@/lib/layouts.ts";
import type { PaletteAction } from "@/lib/palette.ts";
import type { ShownPeriod } from "@/lib/report.ts";
import { resumeCommand } from "@/lib/shell.ts";
import { runShortcut, type ShortcutTargets } from "@/lib/shortcutActions.ts";
import type { Theme } from "@/lib/themes.ts";
import { openDayPage, openThread } from "@/lib/urlState.ts";

/** The filter, and how the palette changes it or opens the toolbar's menu for it. */
export interface PaletteFilter {
  value: Filter;
  onChange: (filter: Filter) => void;
  /** Opens the toolbar's filter menu. */
  open: () => void;
}

/** The theme and how to change it, as the "⋯" menu has them. */
export interface PaletteTheme {
  value: Theme;
  onChange: (theme: Theme) => void;
}

/** The projects, as a list and by id, and whether they are known yet. */
export interface PaletteProjects {
  list: readonly Project[];
  byId: ReadonlyMap<number, Project>;
  /** Known, so a report leaves hidden work out. */
  ready: boolean;
}

/** What the palette's actions act on, beyond what the keys do. */
export interface PaletteTargets {
  /** The keys' own targets: a command with a key runs as the key does. */
  keys: ShortcutTargets;
  projects: PaletteProjects;
  /** The page's own period for the standup, as the toolbar's menu has it; null without one. */
  shown: ShownPeriod | null;
  filter: PaletteFilter;
  theme: PaletteTheme;
}

/** How the palette runs its commands and says how a copy went. */
export interface PaletteActions {
  run: (action: PaletteAction) => void;
  /** How the last copy went, said at the palette's foot; null when there is nothing to say. */
  status: string | null;
  /** Whether trial runs show; null until the settings load. */
  showTrials: boolean | null;
}

/**
 * Carries out the palette's actions with the same hooks the toolbar's controls use. A copy waits
 * for what it needs (the last workday, the session's directory) rather than finding nothing.
 */
export function usePaletteActions({
  keys,
  projects,
  shown,
  filter,
  theme,
}: PaletteTargets): PaletteActions {
  const client = useQueryClient();
  const [copyState, copy] = useCopy();
  const report = useStandupReport(keys.now, projects.byId);
  const [show, setShow, loaded] = useShowTrials();
  const { mutate: updateProject } = useUpdateProject();
  const showAll = useShowAllProjects();

  const run = (action: PaletteAction) => {
    switch (action.kind) {
      case "shortcut":
        runShortcut(action.shortcut, keys);
        return;
      case "date":
        // On the Journal the view stays; from Today the day opens in the Journal's day page
        keys.update(
          LAYOUTS[keys.state.layout].hasPeriod ? { anchor: action.day } : openDayPage(action.day),
          { push: true },
        );
        return;
      case "standup":
        copy(report.periodText(action.period));
        return;
      case "standupShown":
        copy(shown ? report.shownText(shown) : Promise.resolve(null));
        return;
      case "thread":
        if (keys.state.session) keys.update(openThread(keys.state.session));
        return;
      case "resume": {
        const id = keys.state.session;
        copy(
          id === null
            ? Promise.resolve(null)
            : client
                .fetchQuery(sessionQuery(id))
                .then((detail) => resumeCommand(detail.id, detail.launchCwd)),
        );
        return;
      }
      case "filters":
        filter.open();
        return;
      case "clearFilters":
        filter.onChange(clearedFilter(filter.value));
        return;
      case "project":
        updateProject({ id: action.id, update: { hidden: action.hidden } });
        return;
      case "allProjects":
        showAll(projects.list);
        return;
      case "theme":
        theme.onChange(action.theme);
        return;
      case "locale":
        setLocale(action.locale);
        return;
      case "trials":
        setShow(action.show);
        return;
    }
  };
  return { run, status: copyStatus(copyState), showTrials: loaded ? show : null };
}

/** What the palette says after a copy; null before one or once the moment has passed. */
function copyStatus(state: CopyState): string | null {
  const p = paletteMessages();
  const said: Record<CopyState, string | null> = {
    idle: null,
    copied: p.copied,
    empty: p.nothingToCopy,
    failed: formatMessages().copyFailed,
  };
  return said[state];
}
