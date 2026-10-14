import type { LiveSpend, Project } from "@shared/api.ts";
import { SPEND_BUCKET_MS } from "@shared/constants.ts";
import { liveMessages } from "@/i18n/messages/live.ts";
import { projectColor } from "@/lib/colors.ts";
import { hhmm } from "@/lib/dates.ts";
import { costLabel, costPerHourLabel } from "@/lib/format.ts";
import { spendBars } from "@/lib/live.ts";

/**
 * The page's money at a glance, above the columns: today's spend, the rate over the last minutes,
 * and the last three hours as bars stacked in project colors, so a spike says whose it was. It
 * counts every visible session, not only the running ones, and carries the page's one caveat that
 * amounts are list-price estimates.
 */
export function SpendBand({
  spend,
  projects,
  now,
}: {
  spend: LiveSpend;
  projects: ReadonlyMap<number, Project>;
  now: number;
}) {
  const m = liveMessages();
  const bars = spendBars(spend, SPEND_BUCKET_MS);
  return (
    <section
      aria-label={m.spend.chart(hhmm(spend.from), hhmm(now))}
      className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-5 py-3 max-lg:px-3"
    >
      <dl className="flex items-baseline gap-x-5 text-sm">
        <Figure label={m.spend.today} value={costLabel(spend.todayUsd)} />
        <Figure label={m.spend.now} value={costPerHourLabel(spend.perHourUsd)} />
      </dl>
      <figure className="min-w-48 flex-1">
        <div aria-hidden className="flex h-7 items-stretch gap-px border-b">
          {bars.map((bar) => (
            <div
              key={bar.start}
              title={m.spend.bar(
                hhmm(bar.start),
                hhmm(bar.start + SPEND_BUCKET_MS),
                costLabel(bar.total),
              )}
              className="flex flex-1 flex-col-reverse"
            >
              {bar.segments.map((s) => (
                <span
                  key={s.projectId ?? "none"}
                  className="block min-h-px"
                  style={{
                    height: `${s.share * 100}%`,
                    background: projectColor(
                      s.projectId === null ? undefined : projects.get(s.projectId),
                    ),
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <figcaption
          aria-hidden
          className="mt-1 flex justify-between font-num text-muted-foreground text-xs"
        >
          <span>{hhmm(spend.from)}</span>
          <span>{hhmm(now)}</span>
        </figcaption>
      </figure>
      <p className="text-muted-foreground text-xs max-lg:basis-full">
        {m.spend.note}
        {spend.unpriced && <span className="block">{m.spend.unpriced}</span>}
      </p>
    </section>
  );
}

/** One figure of the band: its name in `muted-ink`, its amount in the numeral face. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium font-num">{value}</dd>
    </div>
  );
}
