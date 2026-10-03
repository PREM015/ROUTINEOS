'use client';

/**
 * Weekly Recap - the dashboard's own narrative layer, in two sentences.
 *
 * ## Why it exists alongside AI Insight
 *
 * They answer different questions at different lengths. AI Insight is a longer,
 * optionally-AI-generated weekly analysis that needs a configured model and is
 * off by default. Weekly Recap is a lightweight, always-on, **rule-based**
 * summary computed from the same trailing window the Momentum panel already has
 * in memory. No service to configure, no generation latency, and it cannot hallucinate
 * a best day that does not exist.
 *
 * ## The copy rules
 *
 *  - The best day is named by weekday and score, from actual scored days only.
 *  - The "biggest miss" comes from `routineMisses`, which the service already
 *    gates at 2+ occurrences. A block missed once is not a pattern and naming it
 *    would be the narrative equivalent of a misleading chart.
 *  - The suggestion is derived from the weakest radar axis, so it points at the
 *    same thing the radar is complaining about rather than inventing a third
 *    opinion.
 *  - With no data, it says so in one calm line. It never invents a summary.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { Panel } from '@/components/dashboard-ui';
import { useDashboardOverview } from '@/components/dashboard/useDashboardOverview';
import { WEEKDAY_LABELS } from '@/constants/dashboard';
import type { DashboardDay } from '@/types/dashboard';
import { cn } from '@/lib/utils';

function weekdayOf(date: string): string {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return WEEKDAY_LABELS[day] ?? '';
}

/** Oldest first, so "last 7 days" means the last 7 and not an arbitrary slice. */
function week(days: DashboardDay[]): DashboardDay[] {
  return days.slice(-7);
}

export function WeeklyRecap() {
  const { data, loading, error, reload } = useDashboardOverview();

  const recap = useMemo(() => {
    if (data === null) return null;
    const window = week(data.days);
    const scored = window.filter((d) => d.totalScore !== null);
    if (scored.length === 0) return null;

    const best = scored.reduce((a, b) => ((b.totalScore ?? 0) > (a.totalScore ?? 0) ? b : a));
    const worst = scored.reduce((a, b) => ((b.totalScore ?? 0) < (a.totalScore ?? 0) ? b : a));

    const miss = data.routineMisses[0] ?? null;

    const weakestAxis = (() => {
      const present = data.radar.axes.filter((a) => a.value !== null);
      if (present.length < 3) return null;
      return present.reduce((a, b) => ((b.value ?? 0) < (a.value ?? 0) ? b : a));
    })();

    // Sentence 1: the high-water mark. Always true, always computable.
    // When there is a single scored day it *is* both the best and the hardest, so
    // it is read from `best` rather than reaching back into `scored[0]`.
    const first =
      scored.length === 1
        ? `Your only scored day this week was ${weekdayOf(best.date)} at ${Math.round(best.totalScore ?? 0)}.`
        : `Your best day was ${weekdayOf(best.date)} at ${Math.round(best.totalScore ?? 0)}, and your hardest was ${weekdayOf(worst.date)} at ${Math.round(worst.totalScore ?? 0)}.`;

    // Sentence 2: the pattern, if there is one. Never invented.
    let second: string | null = null;
    if (miss) {
      const times = miss.misses === 1 ? 'once' : `${miss.misses} times`;
      second = `You missed ${miss.blockTitle} ${times}${
        weakestAxis ? `, and ${weakestAxis.label.toLowerCase()} is your weakest domain this week` : ''
      }.`;
    } else if (weakestAxis) {
      second = `${weakestAxis.label} is your weakest domain this week - it is the cheapest one to lift.`;
    } else {
      second = 'Nothing slipped badly enough to call out this week.';
    }

    return { first, second, weakestHref: weakestAxis?.href ?? null };
  }, [data]);

  return (
    <Panel
      title="This week"
      subtitle="A two-line recap"
      // B6: the cyan-violet duotone wash. Marks this as composed narrative
      // rather than a raw metric, which is genuinely useful signal.
      duotone
      loading={loading}
      loadingRows={2}
      minHeightClass="min-h-[11rem]"
      error={error}
      onRetry={() => void reload()}
    >
      <div className="flex flex-1 flex-col justify-between gap-3 px-5 pb-5">
        {recap === null ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Nothing scored this week yet. Log a day on Today and this writes itself.
          </p>
        ) : (
          <div className="space-y-2 text-sm leading-relaxed text-foreground">
            <p>{recap.first}</p>
            <p className="text-muted-foreground">{recap.second}</p>
          </div>
        )}

        {/*
          The refresh icon re-reads the shared overview rather than generating
          anything: the recap is derived, so the only thing a refresh can honestly
          change is the data it derives from. Labelled as a refresh for that reason.
        */}
        <div className="flex items-center justify-between">
          {recap?.weakestHref ? (
            <Link href={recap.weakestHref} className="text-xs font-medium text-primary hover:underline">
              Work on that
            </Link>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => void reload()}
            aria-label="Refresh the recap"
            className={cn(
              'rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              'motion-reduce:transition-none'
            )}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </Panel>
  );
}
