import type { Project, SearchHit } from "@shared/api.ts";
import { MIN_SEARCH_CHARS } from "@shared/constants.ts";
import { FileCode, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatMessages } from "@/i18n/messages/format.ts";
import { searchMessages } from "@/i18n/messages/search.ts";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel, hhmm, type View } from "@/lib/dates.ts";
import { highlightTerms, splitHighlights, visibleHits } from "@/lib/search.ts";
import { projectLabel, projectOf } from "@/lib/selection.ts";
import { cn } from "@/lib/utils.ts";

/** Cross-period search results as the search panel shows them (owned by App's search query). */
export interface SearchState {
  hits: SearchHit[];
  more: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * The search field. Typing filters the shown period as before, and while the field has focus a
 * panel lists matching work from every period (newest first); picking one jumps there.
 * Recalling "when did I do X" is the main reason to look back, and X is rarely in the shown week.
 */
export function SearchField({
  inputRef,
  value,
  files,
  onFiles,
  period,
  onChange,
  search,
  projects,
  onOpen,
  onPanel,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  /** The file button: the words are searched in edited file paths only. */
  files: boolean;
  onFiles: (files: boolean) => void;
  period: View;
  onChange: (q: string) => void;
  search: SearchState;
  projects: Map<number, Project>;
  onOpen: (hit: SearchHit) => void;
  /** Reports whether the results panel is open, so App can keep its own notices out from under it. */
  onPanel: (open: boolean) => void;
}) {
  const m = searchMessages();
  const [focused, setFocused] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const query = value.trim();
  const marks = highlightTerms(query);
  const open = focused && query !== "";
  useEffect(() => onPanel(open), [open, onPanel]);
  // In a narrow window the field is just its icon until used; the button would stick out
  const showFiles = focused || value !== "" || files;
  const hits = visibleHits(search.hits, projects);
  const items = () => [...(listRef.current?.querySelectorAll("button") ?? [])];

  const pick = (hit: SearchHit) => {
    onOpen(hit);
    // Leave the field so j / k and the other keys work at the destination
    inputRef.current?.blur();
    setFocused(false);
  };

  return (
    <search
      // focus-within, not :focus, sizes the field, so pressing the file button doesn't shrink it
      className="group relative flex items-center"
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      <Search className="pointer-events-none absolute left-2 size-4 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Esc clears the input, or leaves the field when empty. Enter leaves the field so j / k
          // walk the period's matches; ↓ goes into the results from every period
          if (e.key === "Escape") {
            if (value) onChange("");
            else e.currentTarget.blur();
          } else if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "ArrowDown" && open) items()[0]?.focus();
          else return;
          e.preventDefault();
        }}
        placeholder={files ? m.filePlaceholder : m.placeholder}
        aria-label={m.label(period)}
        className={cn(
          // Frameless until used, like the toolbar's other controls; the icon and "/" say what it is
          "h-8 w-36 rounded-md border border-transparent pl-7 text-sm outline-none transition-[width] duration-150 placeholder:text-muted-foreground hover:bg-accent focus-visible:border-ring group-focus-within:w-64 group-focus-within:border-input group-focus-within:bg-card motion-reduce:transition-none",
          // Up to xl the open field stays narrower, so the period label beside it keeps its width
          "max-xl:group-focus-within:w-48",
          // In a narrow window only the icon shows until focused, then it opens to a usable width
          "max-lg:w-7 max-lg:group-focus-within:w-32 max-lg:placeholder:text-transparent",
          value && "w-64 border-primary/50 bg-card max-lg:w-32 max-xl:w-48",
          searchPadding(value !== ""),
        )}
      />
      {showFiles && (
        <button
          type="button"
          className={cn(
            "absolute flex size-5 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-ring",
            value ? "right-7" : "right-1",
            files
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
            !focused && !value && "max-lg:hidden",
          )}
          // Keep the caret in the field, so typing goes on and the results stay open
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onFiles(!files);
            inputRef.current?.focus();
          }}
          aria-pressed={files}
          aria-label={m.fileToggle}
          title={m.fileToggle}
        >
          <FileCode className="size-3.5" />
        </button>
      )}
      {value ? (
        <button
          type="button"
          className="absolute right-1 flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label={m.clear}
          title={m.clearTitle}
        >
          <X className="size-3.5" />
        </button>
      ) : (
        !showFiles && (
          <kbd
            className="pointer-events-none absolute right-1.5 rounded border bg-muted px-1 font-num text-[11px] text-muted-foreground leading-4 max-lg:hidden"
            aria-hidden
          >
            /
          </kbd>
        )
      )}

      {open && (
        // Anchored under the field; in a narrow window the field sits mid-bar, so the results span
        // the screen instead of running off its left edge
        <div className="absolute top-10 right-0 z-40 flex max-h-[min(70vh,36rem)] w-[30rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md max-lg:fixed max-lg:inset-x-2 max-lg:top-14 max-lg:w-auto max-lg:max-w-none">
          <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3 text-xs">
            <span className="font-medium text-muted-foreground">
              {m.allPeriods}
              {hits.length > 0 && (
                <span className="ml-2 font-num">
                  {search.more ? m.latest(hits.length) : formatMessages().blocks(hits.length)}
                </span>
              )}
            </span>
            {hits.length > 0 && <span className="text-muted-foreground">{m.keys}</span>}
          </div>
          {[...query].length < MIN_SEARCH_CHARS ? (
            <Note>
              {m.tooShort(MIN_SEARCH_CHARS)}
              {!files && <FileHint />}
            </Note>
          ) : search.error ? (
            <Note className="text-destructive">{m.failed(search.error)}</Note>
          ) : hits.length === 0 ? (
            <Note>
              {search.loading ? m.searching : m.noHits}
              {!search.loading && !files && <FileHint />}
            </Note>
          ) : (
            <ul
              ref={listRef}
              className={cn("min-h-0 overflow-y-auto py-1", search.loading && "opacity-60")}
              aria-busy={search.loading}
            >
              {hits.map((hit) => (
                <li key={`${hit.sessionId}:${hit.start}`} className="px-1">
                  <HitRow
                    hit={hit}
                    terms={marks}
                    project={projectOf(projects, hit.projectId)}
                    onPick={() => pick(hit)}
                    onKeyDown={(e) => {
                      const list = items();
                      const i = list.indexOf(e.currentTarget);
                      if (e.key === "ArrowDown") list[i + 1]?.focus();
                      else if (e.key === "ArrowUp")
                        (i > 0 ? list[i - 1] : inputRef.current)?.focus();
                      else if (e.key === "Escape") inputRef.current?.focus();
                      else return;
                      e.preventDefault();
                      // Keep Esc from also closing the drawer
                      e.stopPropagation();
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </search>
  );
}

/**
 * Right padding that keeps typed text clear of the buttons at the field's end: clear and file
 * with a query, otherwise the "/" hint or the file button. Decided in one place because a
 * `group-focus-within:` padding outranks a plain one and would let text run under the buttons.
 */
function searchPadding(hasQuery: boolean): string {
  if (hasQuery) return "pr-13";
  // A narrow window shows only the icon until focused, so there is nothing to pad for
  return "pr-7 max-lg:pr-0 max-lg:group-focus-within:pr-7";
}

/** Points at the file button (and the `file:` syntax it stands for) while the button is off. */
function FileHint() {
  return <span className="mt-1 block text-xs">{searchMessages().fileHint}</span>;
}

function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("px-3 py-3 text-muted-foreground text-sm", className)}>{children}</p>;
}

function HitRow({
  hit,
  terms,
  project,
  onPick,
  onKeyDown,
}: {
  hit: SearchHit;
  terms: string[];
  project: Project | undefined;
  onPick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const m = searchMessages();
  const f = formatMessages();
  return (
    <button
      type="button"
      onClick={onPick}
      onKeyDown={onKeyDown}
      className="flex w-full gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
    >
      <span
        className="w-[3px] shrink-0 self-stretch rounded-full"
        style={{ background: projectColor(project) }}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-1 font-medium text-sm">
          <Highlight text={hit.headline} terms={terms} />
        </span>
        <span className="flex min-w-0 gap-2 text-muted-foreground text-xs">
          <span className="shrink-0 font-num">
            {dateLabel(hit.start)} {hhmm(hit.start)}
          </span>
          <span className="min-w-0 truncate">
            {projectLabel(project)}
            {hit.label ? f.sessionLabel(hit.label) : ""}
          </span>
          {hit.field !== "headline" && (
            <span className="ml-auto shrink-0 rounded border px-1 text-[11px] leading-4">
              {m.field[hit.field]}
            </span>
          )}
        </span>
        {hit.snippet && (
          <span className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
            <Highlight text={hit.snippet} terms={terms} />
          </span>
        )}
      </span>
    </button>
  );
}

/** Marks every occurrence of the search terms, ignoring case. */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  return splitHighlights(text, terms).map((part, i) =>
    part.match ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string, never reordered
      <mark key={i} className="rounded-sm bg-primary/15 text-inherit">
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  );
}
