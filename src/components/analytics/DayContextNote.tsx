'use client';

import Link from 'next/link';
import { CalendarHeart, MinusCircle } from 'lucide-react';
import type { AnalyticsDashboard } from '@/types/analytics';
import { getDayOfWeek } from '@/lib/dates';
import { annotationLabel, summariseAnnotations } from '@/lib/analytics/day-annotations';

/**
 * The period's planned exceptions, stated plainly.
 *
 * ## Why this exists instead of chart markers
 *
 * AN22 asks for rest-day, minimum-day and day-type markers *on charts*. Rest and
 * minimum markers are not drawn here, and the reason is worth stating rather than
 * papering over: **neither chart on this page plots a per-day series.** `chart1` is four
 * day-outcome buckets or one bar per habit; `chart2` is one bar per tier or one per
 * *month*. A month is not a rest day, and marking twelve month bars "rest day" because
 * one day in the month was would be nonsense.
 *
 * So the annotation data is real, delivered, and consumed — just not as a chart marker,
 * because there is no chart for it to mark. It appears here, as text, where it does the
 * job AN22 actually wants: explaining a period that contains a day the user *chose* to
 * take off or to scale back, so a dip in the average is not read as a failure.
 *
 * The heat calendar (a later phase) is the surface that plots per-day scores, and it is
 * where per-day markers belong. The payload this reads is exactly what it will need.
 *
 * ## Why day type is absent
 *
 * Day type needs `DayTypeDefinition` and `RoutineException`, neither of which
 * `getDashboard` reads. Inferring a type from the routine log or the score would be a
 * fabrication presented as context, which is worse than no context. Deferred, not
 * approximated.
 */
export function DayContextNote({
  annotations,
  periodLabel,
}: {
  annotations: AnalyticsDashboard['annotations'];
  periodLabel: string;
}) {
  const entries = Object.values(annotations).sort((a, b) => a.date.localeCompare(b.date));
  const explanation = summariseAnnotations(annotations);
  if (!explanation) return null;

  return (
    <section
      aria-labelledby="day-context"
      className="mt-6 rounded-xl border border-border/60 bg-card/40 p-4"
    >
      <h2 id="day-context" className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CalendarHeart className="h-4 w-4 text-primary" aria-hidden="true" />
        Planned days in {periodLabel}
      </h2>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {entries.map((entry) => (
          <li key={entry.date}>
            <Link
              href={`/today?date=${entry.date}`}
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-[11px] text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {entry.isRestDay ? (
                <CalendarHeart className="h-3 w-3 text-sky-400" aria-hidden="true" />
              ) : (
                <MinusCircle className="h-3 w-3 text-amber-400" aria-hidden="true" />
              )}
              <span className="tabular-nums">{entry.date}</span>
              <span className="text-muted-foreground">{annotationLabel(entry)}</span>
              <span className="sr-only">
                , {getDayOfWeek(entry.date)}
                {entry.score != null ? `, scored ${Math.round(entry.score)}` : ', not scored'}
                , link
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/*
        The explanation, in words, because the chips alone leave the reader to work out
        why they matter. This is the sentence that stops a rest day inside the period
        reading as a collapse in consistency. Supplied by the shared helper so the chips
        and the sentence cannot disagree.
      */}
      <p className="mt-2 text-xs text-muted-foreground">{explanation}</p>
    </section>
  );
}
