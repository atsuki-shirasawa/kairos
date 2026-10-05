import { useEffect, useState } from "react";

/** 現在時刻。`intervalMs` ごとに更新する（現在時刻の線と「作業中」の表示に使う）。 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
