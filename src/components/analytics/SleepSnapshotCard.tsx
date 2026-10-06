'use client';

import { AlarmClock, BedDouble, MoonStar } from 'lucide-react';
import { minutesToTarget, targetProgress } from '@/lib/analytics/sleep-target';
import type { AnalyticsSleepSnapshot } from '@/types/analytics';

/**
 * Format a duration in minutes as `7h 30m`, or `8h` when it divides evenly.
 *
 * Reads the value the **server** measured against rather than a local constant. That is the
 * whole point: the card's `metTarget` is computed from `targetMinutes`, and if the label
 * came from anywhere else the two could describe different numbers while appearing to be
 * one fact.
 */
function formatTargetDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

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

  /*
    Progress and the met/not-met word come from one place, so they cannot disagree.

    `targetProgress` returns 100 exactly when the server's `metTarget` is true, so the bar
    reaching the end and the verdict beside it are the same fact stated twice — not two
    independently computed ones. Deriving the tick from the server's verdict instead would
    be a second source of truth, which is how a card ends up saying "met ✓" beside a bar
    that stops at 94%.
  */
  const percent =
    sleep.durationMinutes != null && sleep.targetMinutes != null
      ? targetProgress(sleep.durationMinutes, sleep.targetMinutes)
      : null;
  const gap =
    sleep.durationMinutes != null && sleep.targetMinutes != null
      ? minutesToTarget(sleep.durationMinutes, sleep.targetMinutes)
      : null;
  const met = percent !== null ? percent >= 100 : (sleep.metTarget ?? null);

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
        {met != null && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/*
              "Your target" only when it is the user's. `targetSource` comes from the
              server, which is the only place that read the settings row, so the wording
              is correct whether or not anyone has set a target — rather than asserting a
              personal target that may not exist.
            */}
            <span className="text-muted-foreground">
              {sleep.targetSource === 'user' ? 'Your target' : 'App target'}
            </span>
            <span className="font-semibold text-foreground">
              {formatTargetDuration(sleep.targetMinutes ?? 0)}
            </span>
            <span className="font-semibold text-foreground">{met ? 'met ✓' : 'not met'}</span>
            {sleep.targetSource === 'app-default' && (
              <span className="text-[11px] text-muted-foreground">
                app default — set your own in Settings
              </span>
            )}
          </div>
        )}
        {(sleep.targetBedtime != null || sleep.targetWakeTime != null) && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Your hours</span>
            <span className="font-semibold tabular-nums text-foreground">
              {sleep.targetBedtime ?? '—'} – {sleep.targetWakeTime ?? '—'}
            </span>
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

      {/*
        The bar is capped at 100% and the remainder is stated in minutes, so oversleeping
        reads as "reached" rather than as a bar that overflows its track. `role="progressbar"`
        with the real values means a screen reader announces the same thing the eye reads;
        the visible text is not enough on its own.
      */}
      {percent !== null && gap !== null && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
            <span>Progress to target</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Sleep toward target: ${percent} percent`}
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-300 ease-out-expo ${
                met ? 'bg-emerald-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {gap > 0
              ? `${gap} min short of target.`
              : gap < 0
                ? `${Math.abs(gap)} min over target.`
                : 'Exactly on target.'}
          </p>
        </div>
      )}

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