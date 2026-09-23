'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Moon, Sparkles, Target, TrendingUp } from 'lucide-react';
import type { RecapReport } from '@/types/recap';

interface DailyRecapProps {
  day: NonNullable<RecapReport['day']>;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function Tile({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="glass-panel rounded-2xl p-5 shadow-soft">
      <div className="mb-4 inline-flex rounded-xl bg-primary/10 p-2 text-primary">
        {icon}
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export default function DailyRecap({ day }: DailyRecapProps) {
  const scoreTotal = day.score.total;
  const score = scoreTotal ?? 0;

  return (
    <div className="space-y-6">
      {/* Hero stat */}
      <section className="glass-panel glow-primary rounded-2xl p-6 shadow-soft">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Today&apos;s score</h2>
        <div className="flex items-center gap-6">
          <div className="relative h-28 w-28 shrink-0 rounded-full">
            <div
              className="conic-gradient-ring absolute inset-0 rounded-full"
              style={{ '--p': `${Math.min(score, 100)}%` } as CSSProperties}
              aria-hidden="true"
            />
            <div className="absolute inset-1.5 flex items-center justify-center rounded-full glass-panel shadow-soft">
              <span className="text-3xl font-bold tabular-nums text-foreground">
                {Math.round(score)}
              </span>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              {day.score.total != null ? `Grade ${day.score.grade ?? 'N/A'}` : 'No score yet'}
              {day.score.isMinimumDay ? ' \u00b7 Minimum day' : ''}
              {day.score.isRestDay ? ' \u00b7 Rest day' : ''}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {day.score.total != null
                ? 'Score is built from core, growth and bonus points.'
                : 'Score builds once you log habits, routine and sleep.'}
            </p>
          </div>
        </div>

        {day.tiers.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {day.tiers.map((tier) => (
              <div key={tier.tier} className="rounded-xl border border-border/60 bg-card/60 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium capitalize text-foreground">
                    {tier.tier.toLowerCase()}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {tier.completed}/{tier.total}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${tier.completionRate}%` }}
                  />
                </div>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {Math.round(tier.completionRate)}% done
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Tile
          icon={<TrendingUp size={18} />}
          label="Habit reliability"
          value={`${Math.round(day.habitReliability)}%`}
          detail={`${day.routine.total} routine blocks, ${day.routine.completed} completed`}
        />
        <Tile
          icon={<Moon size={18} />}
          label="Sleep"
          value={day.sleep.durationMinutes != null ? formatDuration(day.sleep.durationMinutes) : '--'}
          detail={
            day.sleep.logged
              ? day.sleep.metTarget
                ? 'Target met'
                : 'Below target'
              : 'Not logged'
          }
        />
        <Tile
          icon={<Target size={18} />}
          label="Routine"
          value={day.routine.total > 0 ? `${Math.round(day.routine.completionRate)}%` : '--'}
          detail={
            day.routine.total > 0
              ? `${day.routine.completed} of ${day.routine.total} blocks`
              : 'Nothing scheduled'
          }
        />
      </div>

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        Consistency beats intensity — small wins compound.
      </p>
    </div>
  );
}