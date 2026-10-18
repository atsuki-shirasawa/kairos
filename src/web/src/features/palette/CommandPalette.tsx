import type { Project, SearchHit } from "@shared/api.ts";
import { Search } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { HitSummary } from "@/components/HitSummary.tsx";
import { KeyCap } from "@/components/KeyCap.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.tsx";
import { paletteMessages } from "@/i18n/messages/palette.ts";
import {
  clampRow,
  commandKey,
  type PaletteAction,
  type PaletteContext,
  type PaletteRow,
  type PaletteSection,
  paletteGroupLabel,
  paletteRowId,
  paletteRows,
  paletteSections,
  queryCommands,
  staysOpen,
  stepRow,
} from "@/lib/palette.ts";
import { highlightTerms } from "@/lib/search.ts";
import { projectOf } from "@/lib/selection.ts";
import { keyCap } from "@/lib/shortcuts.ts";
import { cn } from "@/lib/utils.ts";
import { usePaletteHits } from "./usePaletteHits.ts";

/**
 * The ⌘K palette: one field that finds work across every period, jumps to a day it names, and
 * runs any toolbar action, each row showing the key that does the same so the palette teaches
 * the keys. ↑ / ↓ move, Enter runs, Esc closes.
 */
export function CommandPalette({
  open,
  onOpenChange,
  context,
  projects,
  status,
  onRun,
  onOpenHit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: PaletteContext;
  projects: ReadonlyMap<number, Project>;
  /** What the last copy came to, said at the palette's foot; null when there is nothing to say. */
  status: string | null;
  onRun: (action: PaletteAction) => void;
  onOpenHit: (hit: SearchHit) => void;
}) {
  const p = paletteMessages();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Run once the dialog has closed and handed focus back, so it doesn't shut what the action opens
  const pending = useRef<(() => void) | null>(null);
  const listId = useId();
  const hits = usePaletteHits(query, open, projects);
  // Nothing to list while closed, so the commands aren't rebuilt on every render of the app
  const rows = useMemo(
    () => (open ? paletteRows(queryCommands(context, query), hits.hits) : []),
    [open, context, query, hits.hits],
  );
  const current = rows[clampRow(active, rows.length)];

  const closeThen = (then: () => void) => {
    pending.current = then;
    onOpenChange(false);
  };
  const pick = (row: PaletteRow | undefined) => {
    if (!row) return;
    if (row.kind === "hit") closeThen(() => onOpenHit(row.hit));
    else if (staysOpen(row.command.action)) onRun(row.command.action);
    else closeThen(() => onRun(row.command.action));
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const dir = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (dir !== 0) {
      e.preventDefault();
      setActive((i) => stepRow(i, rows.length, dir));
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      pick(current);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[12vh] left-1/2 max-h-[76vh] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2"
        // Each opening starts from an empty field, however the last one closed
        onOpenAutoFocus={() => {
          setQuery("");
          setActive(0);
        }}
        onCloseAutoFocus={(e) => {
          const then = pending.current;
          pending.current = null;
          if (!then) return;
          // The action decides where focus goes (a menu it opens, the block it shows)
          e.preventDefault();
          then();
        }}
      >
        <DialogTitle className="sr-only">{p.title}</DialogTitle>
        <DialogDescription className="sr-only">{p.placeholder}</DialogDescription>
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={current ? paletteRowId(current) : undefined}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={p.placeholder}
            className="h-full min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground"
          />
        </div>
        <PaletteList
          id={listId}
          rows={rows}
          active={current}
          terms={highlightTerms(query)}
          projects={projects}
          onHover={(row) => setActive(rows.indexOf(row))}
          onPick={pick}
        />
        {(hits.loading || rows.length === 0 || status) && (
          <p
            className="shrink-0 border-t px-4 py-2 text-label text-muted-foreground"
            aria-live="polite"
          >
            {status ?? (hits.loading ? p.searching : p.nothing)}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The rows under the field, each group under its heading, then the work search found. */
function PaletteList({
  id,
  rows,
  active,
  terms,
  projects,
  onHover,
  onPick,
}: {
  id: string;
  rows: PaletteRow[];
  active: PaletteRow | undefined;
  terms: string[];
  projects: ReadonlyMap<number, Project>;
  onHover: (row: PaletteRow) => void;
  onPick: (row: PaletteRow) => void;
}) {
  return (
    <div
      id={id}
      role="listbox"
      aria-label={paletteMessages().results}
      className="min-h-0 overflow-y-auto p-1.5"
    >
      {paletteSections(rows).map((section) => (
        <Section key={section.key} section={section}>
          {section.rows.map((row) => (
            // Focus stays in the field, which points at the active option (aria-activedescendant)
            // and handles the keys, so an option takes neither focus nor keys of its own
            // biome-ignore lint/a11y/useKeyWithClickEvents: the field handles the keys
            <div
              key={paletteRowId(row)}
              id={paletteRowId(row)}
              role="option"
              tabIndex={-1}
              aria-selected={row === active}
              onMouseMove={() => row !== active && onHover(row)}
              onClick={() => onPick(row)}
              className={cn(
                "flex cursor-default items-center gap-3 rounded-md px-2.5 py-1.5",
                row === active && "bg-accent",
              )}
            >
              {row.kind === "command" ? (
                <CommandRow label={row.command.label} shortcut={commandKey(row.command)} />
              ) : (
                <HitSummary
                  hit={row.hit}
                  terms={terms}
                  project={projectOf(projects, row.hit.projectId)}
                />
              )}
            </div>
          ))}
        </Section>
      ))}
    </div>
  );
}

/** A group of rows under its heading, as small muted text. */
function Section({ section, children }: { section: PaletteSection; children: React.ReactNode }) {
  const headingId = useId();
  const label =
    section.key === "work" ? paletteMessages().groupWork : paletteGroupLabel(section.key);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of options inside a listbox, not a form's fieldset
    <div role="group" aria-labelledby={headingId}>
      <p id={headingId} className="px-2.5 pt-2.5 pb-1 font-medium text-label text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

/** A command: what it does, and the key that does the same outside the palette. */
function CommandRow({
  label,
  shortcut,
}: {
  label: string;
  shortcut: ReturnType<typeof commandKey>;
}) {
  return (
    <>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && <KeyCap className="shrink-0">{keyCap(shortcut)}</KeyCap>}
    </>
  );
}
