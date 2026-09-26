'use client';

import { Sparkles, TestTube2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecapExtras } from '@/types/recap';

interface MoodEnergyCardProps {
  moodEnergy: RecapExtras['moodEnergy'];
}

function bar(value: number | null): { width: string; className: string; label: string } {
  if (value === null || value === undefined) {
    return { width: '0%', className: '', label: '—' };
  }
  const rating = Math.min(5, Math.max(1, Math.round(value)));
  return {
    width: `${rating * 20}%`,
    className:
      rating >= 4
        ? 'to-emerald-400'
        : rating >= 3
          ? 'to-amber-400'
          : 'to-rose-400',
    label: `${rating}/5`,
  };
}

/**
 * Daily mood and energy across the period. Reading comes from the day's latest
 * MoodLog / EnergyLog when available (falling back to the daily reflection),
 * with triggers and activities surfaced as chips on log-sourced days.
 * Source: MoodLog + EnergyLog rows, DailyReflection fallback.
 */
export default function MoodEnergyCard({ moodEnergy }: MoodEnergyCardProps) {
  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-violet-500/10 p-2 text-violet-500">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Mood &amp; energy</h2>
      </header>

      {moodEnergy.length > 0 ? (
        <ul className="space-y-2">
          {moodEnergy.map((day) => {
            const mood = bar(day.mood);
            const energy = bar(day.energy);
            return (
              <li key={day.date} className="rounded-xl border border-border/60 bg-card/60 px-3 py-2">
                <p className="mb-1 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
                  <span>{day.date}</span>
                  {day.source === 'logs' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-violet-500">
                      <TestTube2 className="h-3 w-3" aria-hidden="true" />
                      Live
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Mood</p>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full bg-gradient-to-r from-violet-500/70', mood.className)}
                        style={{ width: mood.width }}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Energy</p>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full bg-gradient-to-r from-sky-500/70', energy.className)}
                        style={{ width: energy.width }}
                      />
                    </div>
                  </div>
                </div>
                {(day.triggers.length > 0 || day.activities.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {day.triggers.map((item) => (
                      <span
                        key={`t-${item}`}
                        className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-500"
                      >
                        {item}
                      </span>
                    ))}
                    {day.activities.map((item) => (
                      <span
                        key={`a-${item}`}
                        className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-500"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground">
                  {mood.label} · {energy.label}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Log your mood or energy to chart it here.
        </p>
      )}
    </section>
  );
}