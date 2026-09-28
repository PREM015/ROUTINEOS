'use client';

import { Moon } from 'lucide-react';
import { SleepLog } from '@/types/sleep';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SleepQualityMeter } from '@/components/sleep/SleepQualityMeter';
import { formatSleepDuration, calculateSleepScore, calculateSleepDuration } from '@/lib/sleep/calculate-duration';

/**
 * Today's sleep summary.
 *
 * This card was the clearest example of the theming bug in ERROR.md A1/A7: it
 * hardcoded `bg-white`, `text-gray-900`, `text-gray-500` and `bg-indigo-600`,
 * so in the dark theme it rendered as a white panel with near-black text while
 * the rest of the app was dark. Everything is now a semantic token, which means
 * both themes are correct from one definition.
 *
 * It also renders a raw `<button>` instead of the shared `Button`, and laid out
 * with a non-wrapping `flex justify-between`, so the bedtime/wake columns
 * collided on narrow screens. The layout now wraps.
 */
interface SleepCardProps {
  sleepLog?: SleepLog | null;
  targetBedtime?: string;
  targetWakeTime?: string;
  onEdit: () => void;
}

export function SleepCard({ sleepLog, onEdit }: SleepCardProps) {
  if (!sleepLog) {
    return (
      <Card className="border-2 border-dashed border-border bg-muted/30 p-5">
        <div className="flex flex-col items-center justify-center gap-3 py-4 text-center">
          <Moon className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No sleep logged for today.</p>
          <Button onClick={onEdit}>Log sleep</Button>
        </div>
      </Card>
    );
  }

  const plannedDuration =
    sleepLog.targetBedtime && sleepLog.targetWakeTime
      ? calculateSleepDuration(sleepLog.targetBedtime, sleepLog.targetWakeTime)
      : null;

  /**
   * Null when there is no planned window to compare against — the score is
   * "duration vs target", so without a target there is no score. Rendering 0
   * here would read as terrible sleep rather than unmeasured.
   */
  const score =
    sleepLog.actualDurationMinutes !== null && plannedDuration !== null
      ? calculateSleepScore(
          sleepLog.actualDurationMinutes,
          plannedDuration,
          sleepLog.quality,
          sleepLog.feltRested
        )
      : null;

  const durationLabel =
    sleepLog.actualDurationMinutes !== null
      ? formatSleepDuration(sleepLog.actualDurationMinutes)
      : '—';
  const plannedLabel = plannedDuration !== null ? formatSleepDuration(plannedDuration) : '—';
  const bedtimeLabel = sleepLog.actualBedtime ?? '—';
  const wakeTimeLabel = sleepLog.actualWakeTime ?? '—';

  const detail = [
    { label: 'Bedtime', value: bedtimeLabel },
    { label: 'Wake time', value: wakeTimeLabel },
    { label: 'Target', value: plannedLabel },
  ];

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Moon className="h-5 w-5 text-primary" aria-hidden="true" />
          Sleep summary
        </h3>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </div>

      <div className="mb-4">
        <p className="text-xs text-muted-foreground">Slept</p>
        <p className="text-3xl font-bold tabular-nums text-foreground">{durationLabel}</p>
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {detail.map((d) => (
          <div key={d.label} className="rounded-lg bg-muted/50 px-2.5 py-2">
            <dt className="text-xs text-muted-foreground">{d.label}</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
              {d.value}
            </dd>
          </div>
        ))}
      </dl>

      <SleepQualityMeter
        score={score}
        quality={sleepLog.quality}
        feltRested={sleepLog.feltRested}
        wakeUpCount={sleepLog.wakeUpCount}
      />
    </Card>
  );
}
