'use client';

import { getSleepScoreBand, getQualityLabel } from '@/lib/sleep/sleep-score';
import { cn } from '@/lib/utils';

interface SleepQualityMeterProps {
  /** Composite 0–100 sleep score. Null when there is not enough data yet. */
  score: number | null;
  /** Self-reported 1–5 quality rating from the sleep log. */
  quality?: number | null;
  /** Whether the user reported waking up rested. */
  feltRested?: boolean | null;
  /** How many times they woke during the night. */
  wakeUpCount?: number | null;
  /** Rendered smaller inside a dense card. */
  compact?: boolean;
  className?: string;
}

/**
 * Sleep quality meter.
 *
 * ERROR.md A4: "Sleep score is not showing the quality meter of sleep." The
 * sleep card previously rendered only a text badge with the number, so there was
 * nothing to read at a glance and no way to see whether the score was good or
 * bad without knowing the thresholds.
 *
 * Shows a 0–100 bar with a labelled band, the target threshold as a marker, and
 * the inputs that produced the score (self-rated quality, restedness,
 * interruptions) so the number is explainable rather than magic. When there is
 * no score it says why instead of rendering an empty or zeroed bar — a missing
 * value must not look like a bad one.
 */
export function SleepQualityMeter({
  score,
  quality,
  feltRested,
  wakeUpCount,
  compact = false,
  className,
}: SleepQualityMeterProps) {
  if (score === null) {
    return (
      <div
        className={cn(
          'rounded-xl border border-dashed border-border bg-muted/30 px-3 py-3',
          className
        )}
      >
        <p className="text-sm font-medium text-foreground">Sleep quality</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Not enough data for a score yet. Log your bedtime and wake time to see
          it.
        </p>
      </div>
    );
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const band = getSleepScoreBand(clamped);

  return (
    <div className={cn('rounded-xl border border-border bg-card p-3', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">Sleep quality</p>
        <span className="flex items-baseline gap-1.5">
          <span className={cn('text-lg font-semibold tabular-nums', band.color.split(' ').slice(1).join(' '))}>
            {clamped}
          </span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </span>
      </div>

      <div
        className={cn('relative w-full overflow-hidden rounded-full bg-muted', compact ? 'mt-1.5 h-1.5' : 'mt-2 h-2.5')}
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Sleep quality ${clamped} out of 100, ${band.label}`}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-out', band.barColor)}
          style={{ width: `${clamped}%` }}
        />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', band.color)}>
          {band.label}
        </span>
        {!compact && (
          <span className="text-xs text-muted-foreground">{band.description}</span>
        )}
      </div>

      {(quality != null || feltRested != null || wakeUpCount != null) && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          {quality != null && (
            <div className="rounded-lg bg-muted/50 px-2 py-1.5">
              <dt className="text-muted-foreground">Your rating</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {quality}/5 · {getQualityLabel(quality)}
              </dd>
            </div>
          )}
          {feltRested != null && (
            <div className="rounded-lg bg-muted/50 px-2 py-1.5">
              <dt className="text-muted-foreground">Felt rested</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {feltRested ? 'Yes' : 'No'}
              </dd>
            </div>
          )}
          {wakeUpCount != null && (
            <div className="rounded-lg bg-muted/50 px-2 py-1.5">
              <dt className="text-muted-foreground">Woke up</dt>
              <dd className="mt-0.5 font-medium text-foreground tabular-nums">
                {wakeUpCount} {wakeUpCount === 1 ? 'time' : 'times'}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
