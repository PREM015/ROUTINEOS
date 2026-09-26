'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

interface HealthHabit {
  habitId: string;
  name: string;
  tier: string;
  completionRate: number | null;
  dueCount: number;
  health: 'HEALTHY' | 'AT_RISK' | 'UNHEALTHY' | 'NO_DATA';
}

interface HealthSummary {
  totalActive: number;
  withDataCount: number;
  healthyCount: number;
  atRiskCount: number;
  unhealthyCount: number;
  overallCompletionRate: number | null;
}

interface HabitHealthWidgetProps {
  habits?: Habit[];
}

const HEALTH_META: Record<
  HealthHabit['health'],
  { label: string; bar: string; text: string }
> = {
  HEALTHY: { label: 'Healthy', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  AT_RISK: { label: 'At risk', bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  UNHEALTHY: { label: 'Unhealthy', bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  NO_DATA: { label: 'No data', bar: 'bg-muted', text: 'text-muted-foreground' },
};

const TIER_DOT: Record<string, string> = {
  GROWTH: 'bg-emerald-500',
  BONUS: 'bg-sky-500',
  LIFESTYLE: 'bg-amber-500',
  FLEXIBLE: 'bg-violet-500',
  EXPERIMENTAL: 'bg-pink-500',
  OPTIONAL: 'bg-zinc-400',
};

/**
 * Habit Health card: live habit list with today's toggle plus a rolling
 * completion-rate / health summary pulled from GET /api/habits/health.
 * Falls back to a static `habits` prop (stories/tests) when provided.
 */
export function HabitHealthWidget({ habits: habitsProp }: HabitHealthWidgetProps) {
  const { habits, getLogForDate, logHabit, selectedDate } = useApp();
  const today = selectedDate || getTodayString();
  const reduce = useReducedMotion();

  const [healthData, setHealthData] = useState<HealthHabit[]>([]);
  const [healthSummary, setHealthSummary] = useState<HealthSummary | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/habits/health?days=28');
      const result = await res.json();
      if (result.success) {
        setHealthData(result.data.habits as HealthHabit[]);
        setHealthSummary(result.data.summary as HealthSummary);
      }
    } catch {
      // Non-fatal — widget still lists habits without health metrics.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    fetchHealth();
  }, [fetchHealth]);

  const healthByHabit = useMemo(
    () => new Map(healthData.map((h) => [h.habitId, h])),
    [healthData]
  );

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

  const summary = healthSummary;
  const overallRate = summary?.overallCompletionRate;

  const chips = summary
    ? [
        { label: 'Healthy', count: summary.healthyCount, className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
        { label: 'At risk', count: summary.atRiskCount, className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
        { label: 'Unhealthy', count: summary.unhealthyCount, className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
      ]
    : [];

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
        <div className="mb-3 shrink-0 space-y-1.5">
          <p className="text-xs text-muted-foreground tabular-nums">
            {doneCount} of {active.length} done today
            {overallRate !== null && overallRate !== undefined
              ? ` · ${overallRate}% completion`
              : ''}
          </p>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {chips.map((chip) => (
                <span
                  key={chip.label}
                  className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums', chip.className)}
                >
                  {chip.count} {chip.label}
                </span>
              ))}
              {summary?.totalActive != null && summary.totalActive > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                  28-day view
                </span>
              )}
            </div>
          )}
        </div>
      }
    >
      {active.map((habit) => {
        const done = getLogForDate(habit.id, today)?.status === 'COMPLETED';
        const dot = TIER_DOT[habit.tier] ?? 'bg-sky-500';
        const health = healthByHabit.get(habit.id);
        const healthMeta = health ? HEALTH_META[health.health] : null;
        return (
          <motion.div
            key={habit.id}
            layout={reduce ? false : true}
            transition={reduce ? undefined : { layout: { duration: 0.4, ease: EASE } }}
            className="flex items-center gap-2.5 min-h-[56px] rounded-lg border border-border bg-muted/30 px-2.5 py-2 hover:bg-muted/50 transition-colors"
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
              <div className="flex items-center gap-2">
                <p className={cn('truncate text-[13px] font-semibold transition-colors duration-300', done ? 'text-muted-foreground line-through' : 'text-foreground')}>
                  {habit.name}
                </p>
                {healthMeta && (
                  <span className={cn('shrink-0 text-[11px] font-medium', healthMeta.text)}>
                    {health?.completionRate !== null && health?.completionRate !== undefined
                      ? `${health.completionRate}%`
                      : healthMeta.label}
                  </span>
                )}
              </div>
              {health?.completionRate !== null && health?.completionRate !== undefined && (
                <div className="mt-1 w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`${healthMeta?.bar ?? 'bg-emerald-500'} h-1.5 rounded-full transition-all duration-500`}
                    style={{ width: `${health.completionRate}%` }}
                  />
                </div>
              )}
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