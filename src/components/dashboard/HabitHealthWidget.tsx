'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, Circle, Flame } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { getTodayString } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';
import { ScrollableCard } from '@/components/dashboard/ScrollableCard';

interface Habit {
  name: string;
  completionRate: number;
  streak: number;
  tier: string;
}

interface HabitHealthWidgetProps {
  habits?: Habit[];
}

const TIER_DOT: Record<string, string> = {
  GROWTH: 'bg-emerald-500',
  BONUS: 'bg-sky-500',
  LIFESTYLE: 'bg-amber-500',
  FLEXIBLE: 'bg-violet-500',
  EXPERIMENTAL: 'bg-pink-500',
  OPTIONAL: 'bg-zinc-400',
};

/**
 * Compact Habit Health card: header + 3-row scrollable list of live habits
 * with today's toggle, streak and tier dot. Falls back to the static
 * `habits` prop (stories/tests) when provided.
 */
export function HabitHealthWidget({ habits: habitsProp }: HabitHealthWidgetProps) {
  const { habits, getLogForDate, logHabit, selectedDate } = useApp();
  const today = selectedDate || getTodayString();
  const reduce = useReducedMotion();

  if (habitsProp) {
    return (
      <ScrollableCard
        title="Habit Health"
        isEmpty={habitsProp.length === 0}
        emptyMessage="No habits to display"
        action={
          <Link href="/habits" className="shrink-0 text-xs font-semibold text-primary hover:underline">
            Manage
          </Link>
        }
      >
        {habitsProp.map((habit, idx) => (
          <div key={idx} className="h-14 min-h-[56px] rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 flex flex-col justify-center">
            <div className="flex justify-between items-center gap-2 mb-1">
              <span className="truncate text-[13px] font-semibold text-foreground">{habit.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {habit.completionRate}% · 🔥 {habit.streak}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${habit.completionRate}%` }} />
            </div>
          </div>
        ))}
      </ScrollableCard>
    );
  }

  const active = habits.filter((h) => h.status === 'ACTIVE');
  const doneCount = active.filter((h) => getLogForDate(h.id, today)?.status === 'COMPLETED').length;

  const toggle = (habitId: string) => {
    const log = getLogForDate(habitId, today);
    logHabit(habitId, today, log?.status === 'COMPLETED' ? 'MISSED' : 'COMPLETED').catch(() => undefined);
  };

  return (
    <ScrollableCard
      title="Habit Health"
      isEmpty={active.length === 0}
      emptyMessage="No active habits yet."
      action={
        <Link href="/habits" className="shrink-0 text-xs font-semibold text-primary hover:underline">
          Manage
        </Link>
      }
      summary={
        <p className="mb-3 shrink-0 text-xs text-muted-foreground tabular-nums">
          {doneCount} of {active.length} done today
        </p>
      }
    >
      {active.map((habit) => {
        const done = getLogForDate(habit.id, today)?.status === 'COMPLETED';
        const dot = TIER_DOT[habit.tier] ?? 'bg-sky-500';
        return (
          <motion.div
            key={habit.id}
            layout={reduce ? false : true}
            transition={reduce ? undefined : { layout: { duration: 0.4, ease: EASE } }}
            className="flex items-center gap-2.5 h-14 min-h-[56px] rounded-lg border border-border bg-muted/30 px-2.5 hover:bg-muted/50 transition-colors"
          >
            <motion.span
              key={done ? 'done' : 'open'}
              initial={reduce ? false : { scale: done ? 0.6 : 1 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="shrink-0"
            >
              <button
                onClick={() => toggle(habit.id)}
                aria-label={done ? `Mark ${habit.name} not done` : `Mark ${habit.name} done`}
                className={`transition-colors ${done ? 'text-emerald-500' : 'text-muted-foreground hover:text-emerald-500'}`}
              >
                {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
              </button>
            </motion.span>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} title={`Tier: ${habit.tier}`} />
            <div className="flex-1 min-w-0">
              <p className={cn('truncate text-[13px] font-semibold transition-colors duration-300', done ? 'text-muted-foreground line-through' : 'text-foreground')}>
                {habit.name}
              </p>
            </div>
            {(habit.streakCount ?? 0) > 0 && (
              <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-amber-500 tabular-nums">
                <Flame className="h-3 w-3" aria-hidden="true" />
                {habit.streakCount}
              </span>
            )}
          </motion.div>
        );
      })}
    </ScrollableCard>
  );
}

export default HabitHealthWidget;
