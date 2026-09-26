'use client';

import { AlarmClock, BedDouble, MoonStar } from 'lucide-react';
import type { AnalyticsSleepSnapshot } from '@/types/analytics';

interface SleepSnapshotCardProps {
  sleep: AnalyticsSleepSnapshot | null;
}

/**
 * Most recent logged night within the selected period plus a period roll-up
 * (nights logged, average duration). Source: SleepLog rows (null snapshot =
 * placeholder, never fabricated numbers).
 */
export default function SleepSnapshotCard({ sleep }: SleepSnapshotCardProps) {
  if (!sleep) {
    return (
      <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
        <header className="mb-4 flex items-center gap-2">
          <span className="inline-flex rounded-lg bg-indigo-500/10 p-2 text-indigo-500">
            <MoonStar className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">Sleep</h2>
        </header>
        <p className="py-6 text-center text-sm text-muted-foreground">
          No sleep logged in this period yet.
        </p>
      </section>
    );
  }

  const hours = sleep.durationMinutes != null ? (sleep.durationMinutes / 60).toFixed(1) : null;
  const periodAvg =
    sleep.periodStats?.averageDurationMinutes != null
      ? (sleep.periodStats.averageDurationMinutes / 60).toFixed(1)
      : null;

  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-indigo-500/10 p-2 text-indigo-500">
          <MoonStar className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Sleep</h2>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{sleep.date}</span>
      </header>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-card/70 p-3">
          <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <BedDouble className="h-3.5 w-3.5" aria-hidden="true" /> Duration
          </dt>
          <dd className="mt-1 text-2xl font-black tabular-nums text-foreground">
            {hours != null ? `${hours} h` : '—'}
          </dd>
        </div>
        <div className="rounded-xl bg-card/70 p-3">
          <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <AlarmClock className="h-3.5 w-3.5" aria-hidden="true" /> Bed / wake
          </dt>
          <dd className="mt-1 text-2xl font-black tabular-nums text-foreground">
            {sleep.actualBedtime && sleep.actualWakeTime
              ? `${sleep.actualBedtime}–${sleep.actualWakeTime}`
              : '—'}
          </dd>
        </div>
      </dl>

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {sleep.deficitMinutes != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Deficit</span>
            <span className="font-semibold tabular-nums text-foreground">{sleep.deficitMinutes} min</span>
          </div>
        )}
        {sleep.metTarget != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Target</span>
            <span className="font-semibold text-foreground">{sleep.metTarget ? 'met ✓' : 'missed'}</span>
          </div>
        )}
        {sleep.feltRested != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Rested</span>
            <span className="font-semibold text-foreground">{sleep.feltRested ? 'yes' : 'no'}</span>
          </div>
        )}
        {sleep.quality != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Quality</span>
            <span className="font-semibold tabular-nums text-foreground">{sleep.quality}</span>
          </div>
        )}
      </dl>

      {sleep.periodStats && sleep.periodStats.loggedDays > 0 && (
        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-border/60 pt-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Nights logged</span>
            <span className="font-semibold tabular-nums text-foreground">{sleep.periodStats.loggedDays}</span>
          </div>
          {periodAvg && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Avg duration</span>
              <span className="font-semibold tabular-nums text-foreground">{periodAvg} h / night</span>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}