import type { Project, SearchHit } from "@shared/api.ts";
import { Search, X } from "lucide-react";
import { useRef, useState } from "react";
import { MIN_SEARCH_CHARS } from "@/hooks/queries.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { searchMessages } from "@/i18n/messages/search.ts";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel, hhmm } from "@/lib/dates.ts";
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
  period,
  onChange,
  search,
  projects,
  onOpen,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  period: "week" | "day";
  onChange: (q: string) => void;
  search: SearchState;
  projects: Map<number, Project>;
  onOpen: (hit: SearchHit) => void;
}) {
  const m = searchMessages();
  const [focused, setFocused] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const query = value.trim();
  const open = focused && query !== "";
  // Hidden projects stay hidden here too
  const hits = search.hits.filter(
    (h) => h.projectId === null || !projects.get(h.projectId)?.hidden,
  );
  const items = () => [...(listRef.current?.querySelectorAll("button") ?? [])];

  const pick = (hit: SearchHit) => {
    onOpen(hit);
    // Leave the field so j / k and the other keys work at the destination
    inputRef.current?.blur();
    setFocused(false);
  };

  return (
    <search
      className="relative flex items-center"
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      <Search className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
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
        placeholder={m.placeholder}
        aria-label={m.label(period)}
        className={cn(
          "peer h-7 w-36 rounded-md border bg-card pr-7 pl-7 text-sm outline-none transition-[width] duration-150 placeholder:text-muted-foreground focus:w-64 focus-visible:border-ring motion-reduce:transition-none",
          value && "w-64 border-primary/50",
        )}
      />
      {value ? (
        <button
          type="button"
          className="absolute right-1 flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
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
        <kbd
          className="pointer-events-none absolute right-1.5 rounded border bg-muted px-1 font-num text-[10px] text-muted-foreground leading-4 peer-focus:hidden"
          aria-hidden
        >
          /
        </kbd>
      )}

      {open && (
        <div className="absolute top-9 right-0 z-40 flex max-h-[min(70vh,36rem)] w-[30rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
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
            <Note>{m.tooShort(MIN_SEARCH_CHARS)}</Note>
          ) : search.error ? (
            <Note className="text-destructive">{m.failed(search.error)}</Note>
          ) : hits.length === 0 ? (
            <Note>{search.loading ? m.searching : m.noHits}</Note>
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
                    terms={query.split(/\s+/)}
                    project={hit.projectId !== null ? projects.get(hit.projectId) : undefined}
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
            {project?.name ?? f.unknownProject}
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
  const words = terms.filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (words.length === 0) return text;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
  return parts.map((part, i) =>
    // Odd indexes are the captured matches
    i % 2 === 1 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string, never reordered
      <mark key={i} className="rounded-sm bg-primary/15 text-inherit">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
