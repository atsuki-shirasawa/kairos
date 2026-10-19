import type { SearchHit } from "@shared/api.ts";
import { useMemo } from "react";
import { useLocale } from "@/i18n/index.ts";
import { paletteContext } from "@/lib/palette.ts";
import { CommandPalette } from "./CommandPalette.tsx";
import { type PaletteTargets, usePaletteActions } from "./usePaletteActions.ts";

/** Whether the palette is open; App owns it, since ⌘K toggles it. */
export interface PaletteDialog {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The palette wired to the app: what its commands depend on (the page, the open block, the
 * filters, the settings) and how they run.
 */
export function PaletteHost({
  dialog,
  onOpenHit,
  ...targets
}: PaletteTargets & { dialog: PaletteDialog; onOpenHit: (hit: SearchHit) => void }) {
  const locale = useLocale();
  const { run, status, showTrials } = usePaletteActions(targets);
  const { keys, projects, shown, filter, theme } = targets;
  const { layout, view, session } = keys.state;
  const shownReady = shown?.sessions != null;
  // From the fields it reads: App rebuilds the objects holding them on every render
  const context = useMemo(
    () =>
      paletteContext({
        now: keys.now,
        state: { layout, view, session },
        filter: filter.value,
        projects: projects.list,
        theme: theme.value,
        locale,
        showTrials,
        reportReady: projects.ready,
        shownReady,
      }),
    [
      keys.now,
      layout,
      view,
      session,
      filter.value,
      projects.list,
      projects.ready,
      theme.value,
      locale,
      showTrials,
      shownReady,
    ],
  );
  return (
    <CommandPalette
      open={dialog.open}
      onOpenChange={dialog.onOpenChange}
      context={context}
      projects={projects.byId}
      status={status}
      onRun={run}
      onOpenHit={onOpenHit}
    />
  );
}
