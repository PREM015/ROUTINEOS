'use client';

import { Flame, Moon, Star, TrendingUp } from 'lucide-react';
import type { RecapReport } from '@/types/recap';
import StatTile from './stat-tile';

interface WeeklyRecapProps {
  week: NonNullable<RecapReport['week']>;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export default function WeeklyRecap({ week }: WeeklyRecapProps) {
  const { scores, habits, sleep, streaks, trend } = week;

  return (
    <section className="glass-panel glow-primary rounded-2xl p-6 shadow-soft">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-sm text-muted-foreground">Average score</h2>
          <div className="mt-1 flex items-end gap-2">
            <span className="text-6xl font-black tabular-nums leading-none text-foreground">
              {Math.round(scores.average)}
            </span>
            <span className="pb-1 text-sm text-muted-foreground">/ 100</span>
          </div>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">
          <TrendingUp className="mr-1 inline h-4 w-4" aria-hidden="true" />
          {trend.delta >= 0 ? '+' : ''}
          {trend.delta.toFixed(1)} vs last week
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<Star className="h-5 w-5" />}
          label="Perfect days"
          value={String(scores.perfectDays)}
          detail={
            scores.excellentDays > 0
              ? `${scores.excellentDays} excellent (80+)`
              : 'No 100-point days yet'
          }
          accent="amber"
        />
        <StatTile
          icon={<TrendingUp className="h-5 w-5" />}
          label="Habit completion"
          value={`${Math.round(habits.averageCompletionRate)}%`}
          detail={
            habits.mostCompleted
              ? `${habits.mostCompleted.habitName} most consistent`
              : 'No habits logged'
          }
        />
        <StatTile
          icon={<Moon className="h-5 w-5" />}
          label="Sleep"
          value={sleep.loggedDays > 0 ? formatDuration(sleep.averageDuration) : '--'}
          detail={sleep.loggedDays > 0 ? `${sleep.loggedDays} nights logged` : 'No sleep logged'}
          accent="sky"
        />
        <StatTile
          icon={<Flame className="h-5 w-5" />}
          label="Current streak"
          value={`${streaks.current} day${streaks.current === 1 ? '' : 's'}`}
          detail={`Longest: ${streaks.longest}`}
          accent="emerald"
        />
      </div>
    </section>
  );
}