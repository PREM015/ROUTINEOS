'use client';

import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Flame,
  NotebookText,
  Target,
} from 'lucide-react';
import type { RecapReport } from '@/types/recap';
import StatTile from './stat-tile';

interface YearlyRecapProps {
  year: NonNullable<RecapReport['year']>;
}

export default function YearlyRecap({ year }: YearlyRecapProps) {
  const { totalDaysScored, averageScore, bestMonth, worstMonth, habits, streaks, goals, focus, journal } =
    year;

  return (
    <div className="space-y-6">
      <section className="glass-panel glow-primary rounded-2xl p-6 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-sm text-muted-foreground">Year average score</h2>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-6xl font-black tabular-nums leading-none text-foreground">
                {Math.round(averageScore)}
              </span>
              <span className="pb-1 text-sm text-muted-foreground">/ 100</span>
            </div>
          </div>
          <p className="text-sm tabular-nums text-muted-foreground">
            <CalendarDays className="mr-1 inline h-4 w-4" aria-hidden="true" />
            {totalDaysScored} days scored
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {bestMonth && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-xs uppercase tracking-widest text-emerald-500">
                Best month
              </p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {bestMonth.month}
                <span className="ml-2 text-sm font-semibold tabular-nums text-emerald-500">
                  {Math.round(bestMonth.averageScore)}
                </span>
              </p>
            </div>
          )}
          {worstMonth && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
              <p className="text-xs uppercase tracking-widest text-rose-500">
                Toughest month
              </p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {worstMonth.month}
                <span className="ml-2 text-sm font-semibold tabular-nums text-rose-500">
                  {Math.round(worstMonth.averageScore)}
                </span>
              </p>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          icon={<Flame className="h-5 w-5" />}
          label="Longest streak"
          value={`${streaks.longest} days`}
          detail={`Currently at ${streaks.current}`}
          accent="amber"
        />
        <StatTile
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Habits completed"
          value={String(habits.totalCompleted)}
          detail={
            habits.bestHabit
              ? `${habits.bestHabit.habitName} was your star (${Math.round(habits.bestHabit.completionRate)}%)`
              : 'No habits logged'
          }
          accent="emerald"
        />
        <StatTile
          icon={<Target className="h-5 w-5" />}
          label="Goals completed"
          value={String(goals.completed)}
          detail="Closed out across the year"
          accent="sky"
        />
        <StatTile
          icon={<Clock className="h-5 w-5" />}
          label="Deep focus"
          value={`${Math.round(focus.totalFocusMinutes / 60)}h`}
          detail={`${focus.totalSessions} sessions`}
          accent="sky"
        />
        <StatTile
          icon={<NotebookText className="h-5 w-5" />}
          label="Journal entries"
          value={String(journal.entryCount)}
          detail="Thoughts captured along the way"
          accent="amber"
        />
        <StatTile
          icon={<CalendarDays className="h-5 w-5" />}
          label="Missed habits"
          value={String(habits.totalMissed)}
          detail={`Completion rate ${Math.round(habits.averageCompletionRate)}%`}
        />
      </div>
    </div>
  );
}