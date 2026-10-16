import type { Project, SearchHit } from "@shared/api.ts";
import { MIN_SEARCH_CHARS } from "@shared/constants.ts";
import { FileCode, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRovingFocus } from "@/hooks/useRovingFocus.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { searchMessages } from "@/i18n/messages/search.ts";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel, hhmm } from "@/lib/dates.ts";
import { highlightTerms, splitHighlights, visibleHits } from "@/lib/search.ts";
import { projectLabel, projectOf } from "@/lib/selection.ts";
import { cn } from "@/lib/utils.ts";
import type { View } from "@/lib/view.ts";

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
  const roving = useRovingFocus(listRef, inputRef);
  const query = value.trim();
  const open = focused && query !== "";
  useEffect(() => onPanel(open), [open, onPanel]);
  // In a narrow window the field is just its icon until used; the button would stick out
  const showFiles = focused || value !== "" || files;

  const pick = (hit: SearchHit) => {
    onOpen(hit);
    // Leave the field so j / k and the other keys work at the destination
    inputRef.current?.blur();
    setFocused(false);
  };

  /**
   * Esc clears the input, or leaves the field when empty. Enter leaves the field so j / k walk
   * the period's matches; ↓ goes into the results from every period.
   */
  const onFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (value) onChange("");
      else e.currentTarget.blur();
    } else if (e.key === "Enter") e.currentTarget.blur();
    else if (e.key === "ArrowDown" && open) roving.focusFirst();
    else return;
    e.preventDefault();
  };

  const refocus = () => inputRef.current?.focus();

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
        onKeyDown={onFieldKeyDown}
        placeholder={files ? m.filePlaceholder : m.placeholder}
        aria-label={m.label(period)}
        className={cn(
          // Frameless until used, like the toolbar's other controls; the icon and "/" say what it is
          "h-8 w-36 rounded-md border border-transparent pl-7 text-body outline-none transition-[width] duration-150 placeholder:text-muted-foreground hover:bg-accent focus-visible:border-ring group-focus-within:w-64 group-focus-within:border-input group-focus-within:bg-card motion-reduce:transition-none",
          // Up to xl the open field stays narrower, so the period label beside it keeps its width
          "max-xl:group-focus-within:w-48",
          // In a narrow window only the icon shows until focused, then it opens to a usable width
          "max-lg:w-7 max-lg:group-focus-within:w-32 max-lg:placeholder:text-transparent",
          value && "w-64 border-primary/50 bg-card max-lg:w-32 max-xl:w-48",
          searchPadding(value !== ""),
        )}
      />
      {showFiles && (
        <FileToggleButton
          files={files}
          hasQuery={value !== ""}
          focused={focused}
          onToggle={() => {
            onFiles(!files);
            refocus();
          }}
        />
      )}
      {value ? (
        <ClearButton
          onClear={() => {
            onChange("");
            refocus();
          }}
        />
      ) : (
        !showFiles && <SlashHint />
      )}

      {open && (
        <ResultsPanel
          query={query}
          files={files}
          search={search}
          projects={projects}
          listRef={listRef}
          onPick={pick}
          onItemKeyDown={roving.onItemKeyDown}
        />
      )}
    </search>
  );
}

/** Restricts the words to edited file paths (the `file:` syntax), at the field's end. */
function FileToggleButton({
  files,
  hasQuery,
  focused,
  onToggle,
}: {
  files: boolean;
  hasQuery: boolean;
  focused: boolean;
  onToggle: () => void;
}) {
  const m = searchMessages();
  return (
    <button
      type="button"
      className={cn(
        "absolute flex size-5 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-ring",
        hasQuery ? "right-7" : "right-1",
        files
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        !focused && !hasQuery && "max-lg:hidden",
      )}
      // Keep the caret in the field, so typing goes on and the results stay open
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
      aria-pressed={files}
      aria-label={m.fileToggle}
      title={m.fileToggle}
    >
      <FileCode className="size-3.5" />
    </button>
  );
}

/** Empties the field, at its end while it holds a query. */
function ClearButton({ onClear }: { onClear: () => void }) {
  const m = searchMessages();
  return (
    <button
      type="button"
      className="absolute right-1 flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      onClick={onClear}
      aria-label={m.clear}
      title={m.clearTitle}
    >
      <X className="size-3.5" />
    </button>
  );
}

/** The `/` key cap that says how to reach the empty field from anywhere. */
function SlashHint() {
  return (
    <kbd
      className="pointer-events-none absolute right-1.5 rounded border bg-muted px-1 font-num text-meta text-muted-foreground leading-4 max-lg:hidden"
      aria-hidden
    >
      /
    </kbd>
  );
}

/** The panel under the field listing matching work from every period, or why there is none. */
function ResultsPanel({
  query,
  files,
  search,
  projects,
  listRef,
  onPick,
  onItemKeyDown,
}: {
  query: string;
  files: boolean;
  search: SearchState;
  projects: Map<number, Project>;
  listRef: React.RefObject<HTMLUListElement | null>;
  onPick: (hit: SearchHit) => void;
  onItemKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const m = searchMessages();
  const hits = visibleHits(search.hits, projects);
  const marks = highlightTerms(query);
  return (
    // Anchored under the field; in a narrow window the field sits mid-bar, so the results span
    // the screen instead of running off its left edge
    <div className="absolute top-10 right-0 z-40 flex max-h-[min(70vh,36rem)] w-[30rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md max-lg:fixed max-lg:inset-x-2 max-lg:top-14 max-lg:w-auto max-lg:max-w-none">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3 text-label">
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
                onPick={() => onPick(hit)}
                onKeyDown={onItemKeyDown}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
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
  return <span className="mt-1 block text-label">{searchMessages().fileHint}</span>;
}

/** A line of text in the panel where results would be (too short, failed, nothing found). */
function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("px-3 py-3 text-body text-muted-foreground", className)}>{children}</p>;
}

/** One result: its headline, when and where, the field that matched, and a snippet. */
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
        <span className="line-clamp-1 font-medium text-body">
          <Highlight text={hit.headline} terms={terms} />
        </span>
        <span className="flex min-w-0 gap-2 text-label text-muted-foreground">
          <span className="shrink-0 font-num">
            {dateLabel(hit.start)} {hhmm(hit.start)}
          </span>
          <span className="min-w-0 truncate">
            {projectLabel(project)}
            {hit.label ? f.sessionLabel(hit.label) : ""}
          </span>
          {hit.field !== "headline" && (
            <span className="ml-auto shrink-0 rounded border px-1 text-meta leading-4">
              {m.field[hit.field]}
            </span>
          )}
        </span>
        {hit.snippet && (
          <span className="line-clamp-2 text-label text-muted-foreground leading-relaxed">
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
