'use client';

/**
 * Day-type performance - "am I actually worse on weekends?".
 *
 * A pattern question that `/today` structurally cannot answer. `/today` resolves
 * exactly one day type per render and shows one day's number, so it can only ever
 * tell you what today was. Whether that number is typical *for that kind of day*
 * requires weeks of history bucketed by type, which is what this is.
 *
 * ## Why the 3-day floor exists
 *
 * The brief's example - "Exam Day 48" - is the dangerous shape of this widget. A
 * single exam day renders as a short bar labelled "Exam Day 48", which is
 * indistinguishable from a real, stable pattern. So a type below
 * `DAY_TYPE_MIN_SCORED_DAYS` gets a muted "not enough data yet" row instead of a
 * bar. A missing bar is honest; a one-sample bar is a lie with an axis.
 *
 * ## B4: deliberately quiet
 *
 * No tilt, no glow, no shimmer. This is a pattern-reading tool, and giving every
 * card the hero treatment is exactly how a page stops looking premium and starts
 * looking exhausting.
 */

import { Panel, PanelEmpty } from '@/components/dashboard-ui';
import { DOMAIN_ACCENT, accentRing } from '@/components/dashboard-ui/accent';
import { useDashboardOverview } from '@/components/dashboard/useDashboardOverview';
import { cn } from '@/lib/utils';

const DAY_TYPE_MIN_SCORED_DAYS = 3;

export function DayTypePerformance() {
  const { data, loading, error, reload } = useDashboardOverview();
  const buckets = data?.dayTypes ?? [];

  // Types with enough history get a bar; the rest are still listed, muted, so the
  // user learns their own day types exist instead of watching them silently
  // vanish and reappear as they accumulate data.
  const ranked = buckets.filter((b) => b.scoredDays >= DAY_TYPE_MIN_SCORED_DAYS);
  const thin = buckets.filter((b) => b.scoredDays < DAY_TYPE_MIN_SCORED_DAYS);
  const best = ranked[0]?.averageScore ?? null;
  const worst = ranked.length > 1 ? ranked[ranked.length - 1]?.averageScore ?? null : null;

  return (
    <Panel
      title="By day type"
      subtitle="Average score, last 30 days"
      domain="routine"
      loading={loading}
      loadingRows={3}
      minHeightClass="min-h-[13rem]"
      error={error}
      onRetry={() => void reload()}
      isEmpty={!loading && buckets.length === 0}
      empty={
        <PanelEmpty
          title="No scored days yet"
          description="Once a few days are scored, this breaks your score down by the kind of day it was."
        />
      }
    >
      <div className="flex flex-1 flex-col gap-3 px-5 pb-5">
        {/*
          The headline read. Only rendered when there are at least two usable
          types, because "you are 30 points worse on weekends" is a claim about a
          *difference*, and with one type there is nothing to compare.
        */}
        {worst !== null && best !== null && best - worst >= 8 && (
          <p className="rounded-[14px] bg-muted/50 px-3 py-2 text-xs leading-relaxed text-foreground">
            You score{' '}
            <span className="font-semibold">{best - worst} points higher</span> on your best day
            type than your worst. That gap is a scheduling problem, not a discipline
            one.
          </p>
        )}

        <ul className="space-y-2.5">
          {ranked.map((bucket) => {
            const value = bucket.averageScore;
            return (
              <li key={bucket.dayTypeName} className="flex items-center gap-3">
                <span className="w-20 shrink-0 truncate text-xs font-medium text-foreground">
                  {bucket.dayTypeName}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out-expo motion-reduce:transition-none"
                    style={{
                      width: `${Math.max(2, value)}%`,
                      background: accentRing(DOMAIN_ACCENT.routine.hue, 70),
                    }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-foreground">
                  {value}
                </span>
                <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/70">
                  {bucket.scoredDays}d
                </span>
              </li>
            );
          })}
        </ul>

        {thin.length > 0 && (
          <ul className="space-y-1 border-t border-border/60 pt-2.5">
            {thin.map((bucket) => (
              <li
                key={bucket.dayTypeName}
                className={cn(
                  'flex items-center justify-between gap-3 text-[11px] text-muted-foreground/70'
                )}
              >
                <span className="truncate">{bucket.dayTypeName}</span>
                <span className="shrink-0">
                  {bucket.scoredDays === 1 ? '1 day' : `${bucket.scoredDays} days`} &middot; not
                  enough data yet
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
