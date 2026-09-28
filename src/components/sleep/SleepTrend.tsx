'use client';

import { Card } from '@/components/ui/Card';
import { formatSleepDuration } from '@/lib/sleep/calculate-duration';
import { getSleepScoreBand } from '@/lib/sleep/sleep-score';
import { cn } from '@/lib/utils';

interface SleepTrendProps {
  data: Array<{ date: string; totalMinutes: number }>;
  targetMinutes: number;
}

/**
 * Last-7-days sleep bars.
 *
 * Hardcoded `bg-white`, `text-gray-500/600/800` here too, so the panel stayed
 * white-on-dark in the dark theme. The bar colours are semantic status colours
 * (emerald / amber / rose) which read correctly in both themes, and the tooltip
 * uses the popover token instead of a fixed `bg-gray-800`.
 */
export function SleepTrend({ data, targetMinutes }: SleepTrendProps) {
  // Keep the target line visible even when every bar is far below it.
  const maxMins = Math.max(...data.map((d) => d.totalMinutes), targetMinutes + 120, 1);

  return (
    <Card className="p-5">
      <h3 className="mb-4 text-base font-semibold text-foreground">
        Sleep trend <span className="text-sm font-normal text-muted-foreground">(last 7 days)</span>
      </h3>

      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No sleep logged in the last 7 days.
        </p>
      ) : (
        <>
          <div className="flex h-32 items-end gap-1.5 sm:gap-2">
            {data.map((day) => {
              const met = day.totalMinutes >= targetMinutes;
              const close = !met && day.totalMinutes >= targetMinutes - 60;
              const barColor = met
                ? 'bg-emerald-500'
                : close
                  ? 'bg-amber-500'
                  : 'bg-rose-500';
              const heightPercent = Math.min(100, (day.totalMinutes / maxMins) * 100);
              // Ratio to target drives a readable band label and the a11y text.
              const ratio = targetMinutes > 0 ? day.totalMinutes / targetMinutes : null;
              const band = ratio === null ? null : getSleepScoreBand(Math.round(ratio * 100));

              return (
                <div key={day.date} className="group relative flex flex-1 flex-col items-center">
                  <div
                    className={cn(
                      'w-full rounded-t-md transition-all duration-300 hover:opacity-80',
                      barColor
                    )}
                    style={{ height: `${Math.max(heightPercent, 2)}%` }}
                    title={`${day.date}: ${formatSleepDuration(day.totalMinutes)}`}
                  >
                    <span className="sr-only">
                      {day.date}: {formatSleepDuration(day.totalMinutes)}
                      {band ? `, ${band.label}` : ''}
                    </span>
                  </div>
                  <span className="mt-1 text-[10px] text-muted-foreground sm:text-xs">
                    {new Date(day.date).toLocaleDateString(undefined, { weekday: 'narrow' })}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
            <span>
              Target: {formatSleepDuration(targetMinutes)}
            </span>
            <span className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                Met
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                Close
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
                Under
              </span>
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
