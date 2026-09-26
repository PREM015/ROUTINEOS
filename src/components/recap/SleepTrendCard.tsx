'use client';

import { Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_CONFIG } from '@/config/app';
import type { RecapExtras } from '@/types/recap';

interface SleepTrendCardProps {
  sleepTrend: RecapExtras['sleepTrend'];
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Nightly sleep durations across the period. Each row shows the night's
 * duration and whether the user met their target (green) or fell short (rose).
 * Source: SleepLog rows.
 */
export default function SleepTrendCard({ sleepTrend }: SleepTrendCardProps) {
  const target = APP_CONFIG.defaults.sleep.targetDuration;

  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-sky-500/10 p-2 text-sky-500">
          <Moon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Nights slept</h2>
      </header>

      {sleepTrend.length > 0 ? (
        <ul className="space-y-2">
          {sleepTrend.map((night) => {
            const met = night.durationMinutes !== null && night.durationMinutes >= target;
            return (
              <li
                key={night.date}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-card/60 px-3 py-2"
              >
                <span className="text-xs tabular-nums text-muted-foreground">{night.date}</span>
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    night.durationMinutes === null
                      ? 'text-muted-foreground'
                      : met
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                  )}
                >
                  {night.durationMinutes !== null ? formatDuration(night.durationMinutes) : '—'}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Log sleep during this period to see your nights here.
        </p>
      )}
    </section>
  );
}