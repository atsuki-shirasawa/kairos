/**
 * A count done out of all, with a thin bar in the project color on the input tone (the card is
 * already `muted`, and `border` barely differs from it). Shared by the task list and a batch of
 * subagents.
 */
export function ProgressBar({
  label,
  done,
  total,
}: {
  label: string;
  done: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 font-num">{label}</span>
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-input">
        <span
          className="block h-full rounded-full bg-[var(--c)]"
          style={{ width: `${(done / Math.max(total, 1)) * 100}%` }}
        />
      </span>
    </div>
  );
}
