/** Hours labeled on the left of the grid. Midnight at either end needs no label. */
const LABELED_HOURS = Array.from({ length: 23 }, (_, i) => i + 1);

/** The hour label column on the left of the time grid. */
export function HourLabels({ hourPx }: { hourPx: number }) {
  return (
    <div className="relative" aria-hidden>
      {LABELED_HOURS.map((h) => (
        <span
          key={h}
          className="absolute right-2 -translate-y-1/2 font-num text-[11px] text-muted-foreground"
          style={{ top: h * hourPx }}
        >
          {h}:00
        </span>
      ))}
    </div>
  );
}
