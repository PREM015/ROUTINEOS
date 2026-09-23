'use client';

import {
  BadgeCheck,
  CheckCircle2,
  Clock,
  Moon,
  NotebookText,
  Star,
} from 'lucide-react';
import type { RecapReport } from '@/types/recap';
import StatTile from './stat-tile';

interface MonthlyRecapProps {
  month: NonNullable<RecapReport['month']>;
}

export default function MonthlyRecap({ month }: MonthlyRecapProps) {
  const { scores, habits, focus, journal, goals, sleep } = month;

  return (
    <div className="space-y-6">
      <section className="glass-panel glow-primary rounded-2xl p-6 shadow-soft">
        <h2 className="mb-4 text-lg font-semibold text-foreground">This month at a glance</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-card/60 p-4">
            <p className="text-sm text-muted-foreground">Average score</p>
            <p className="mt-1 text-4xl font-black tabular-nums text-foreground">
              {Math.round(scores.average)}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/60 p-4">
            <p className="text-sm text-muted-foreground">Perfect days</p>
            <p className="mt-1 text-4xl font-black tabular-nums text-emerald-500">
              {scores.perfectDays}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/60 p-4">
            <p className="text-sm text-muted-foreground">Excellent days</p>
            <p className="mt-1 text-4xl font-black tabular-nums text-amber-500">
              {scores.excellentDays}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/60 p-4">
            <p className="text-sm text-muted-foreground">Habits completed</p>
            <p className="mt-1 text-4xl font-black tabular-nums text-primary">
              {habits.totalCompleted}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          icon={<Clock className="h-5 w-5" />}
          label="Deep focus"
          value={`${focus.totalSessions} session${focus.totalSessions === 1 ? '' : 's'}`}
          detail={`${Math.round(focus.totalFocusMinutes / 60)}h focused total`}
          accent="sky"
        />
        <StatTile
          icon={<NotebookText className="h-5 w-5" />}
          label="Journal entries"
          value={String(journal.entryCount)}
          detail="Moments captured this month"
          accent="amber"
        />
        <StatTile
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Goals completed"
          value={String(goals.completed)}
          detail={`${goals.milestonesHit} milestones hit along the way`}
          accent="emerald"
        />
        <StatTile
          icon={<BadgeCheck className="h-5 w-5" />}
          label="Habit completion"
          value={`${Math.round(habits.averageCompletionRate)}%`}
          detail={
            habits.perHabit.length > 0
              ? `${habits.perHabit.length} habits tracked`
              : 'No habits logged'
          }
        />
        <StatTile
          icon={<Moon className="h-5 w-5" />}
          label="Sleep avg"
          value={`${Math.round(sleep.averageDuration / 60)}h`}
          detail={`${sleep.nightsMeetingTarget} nights met target`}
          accent="sky"
        />
        <StatTile
          icon={<Star className="h-5 w-5" />}
          label="Missed habits"
          value={String(habits.totalMissed)}
          detail="Chances to improve next month"
          accent="amber"
        />
      </div>
    </div>
  );
}