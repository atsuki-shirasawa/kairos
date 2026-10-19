import { type FSWatcher, watch } from "node:fs";

/** How a directory is watched. */
export interface DirWatchOptions {
  /** How long events must settle before `onChange` runs: one save can report several events. */
  debounceMs: number;
  /** Which entries matter, by name; every one when absent. */
  only?: (file: string | null) => boolean;
}

/**
 * Calls `onChange` once a burst of changes in `dir` settles. A directory that can't be watched
 * (missing, say) reports nothing, so callers that must notice one appearing poll as well. Returns
 * a function that stops watching.
 */
export function watchDirectory(
  dir: string,
  onChange: () => void,
  { debounceMs, only }: DirWatchOptions,
): () => void {
  let timer: Timer | null = null;
  let watcher: FSWatcher | null = null;
  try {
    watcher = watch(dir, (_event, file) => {
      if (only && !only(file)) return;
      timer ??= setTimeout(() => {
        timer = null;
        onChange();
      }, debounceMs);
    });
  } catch {
    // Nothing to watch: see above
  }
  return () => {
    watcher?.close();
    if (timer) clearTimeout(timer);
  };
}
