import { type FSWatcher, watch } from "node:fs";
import { join } from "node:path";
import type { Ingester } from "./ingester.ts";

const DEBOUNCE_MS = 300;
/** 監視イベントの取りこぼしに備えて、この間隔で全体を走査し直す（差分がなければ一瞬で終わる）。 */
const RESCAN_MS = 60_000;

/**
 * projects ディレクトリを監視し、変更のあったファイルを取り込む。
 * `onChange` には表示が変わりうるセッションの ID が渡る。
 */
export function watchProjects(ingester: Ingester, onChange: (ids: string[]) => void): () => void {
  const pending = new Set<string>();
  let timer: Timer | null = null;
  let fullScan = false;

  const flush = () => {
    timer = null;
    const touched = new Set<string>();
    try {
      if (fullScan) {
        fullScan = false;
        pending.clear();
        for (const id of ingester.scan().sessions) touched.add(id);
      } else {
        const paths = [...pending];
        pending.clear();
        for (const path of paths) for (const id of ingester.ingestFile(path)) touched.add(id);
      }
    } catch (e) {
      console.error("kairos: ingest failed:", e);
    }
    if (touched.size) onChange([...touched]);
  };

  const schedule = () => {
    timer ??= setTimeout(flush, DEBOUNCE_MS);
  };

  let watcher: FSWatcher | null = null;
  try {
    watcher = watch(ingester.projectsDir, { recursive: true }, (_event, filename) => {
      if (!filename) fullScan = true;
      else if (filename.endsWith(".jsonl") || filename.endsWith(".meta.json")) {
        pending.add(join(ingester.projectsDir, filename));
      } else return;
      schedule();
    });
  } catch (e) {
    console.error(
      `kairos: cannot watch ${ingester.projectsDir}; falling back to periodic scans:`,
      e,
    );
  }
  const rescan = setInterval(() => {
    fullScan = true;
    schedule();
  }, RESCAN_MS);

  return () => {
    watcher?.close();
    clearInterval(rescan);
    if (timer) clearTimeout(timer);
  };
}
