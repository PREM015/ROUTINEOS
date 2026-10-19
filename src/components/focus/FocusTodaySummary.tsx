'use client';

import { useEffect, useMemo, useState } from 'react';
import { Flame, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { Skeleton } from '@/components/ui/Skeleton';

interface StatsPayload {
  days: Array<{ date: string; focusMinutes: number; sessions: number }>;
  today: {
    date: string;
    focusMinutes: number;
    sessions: number;
    completedSessions: number;
    partialSessions: number;
  };
  streakDays: number;
  plannedFocusMinutes: number;
  actualFocusMinutes: number;
}

/** "2h 05m". Zero renders as "0m" — a bare "0h 0m" is noise. */
export function formatFocusDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, '0')}m`;
}

export function FocusTodaySummary({ className }: { className?: string }) {
  const { timezone, today } = useUserTimezone();
  const [payload, setPayload] = useState<StatsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<StatsPayload>('/api/focus/stats', {
      query: { from: today, to: today },
    })
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load today's focus.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [timezone, today]);

  const drift = useMemo(() => {
    if (!payload) return null;
    const planned = Math.round(payload.plannedFocusMinutes);
    const actual = Math.round(payload.actualFocusMinutes);
    if (planned <= 0) return null;
    const diff = actual - planned;
    if (diff === 0) return null;
    return {
      minutes: Math.abs(diff),
      isOver: diff > 0,
      label:
        diff > 0
          ? `${formatFocusDuration(diff)} over plan`
          : `${formatFocusDuration(-diff)} under plan`,
    };
  }, [payload]);

  if (error) {
    return (
      <p className={cn('text-muted-foreground text-xs', className)} role="status">
        Today&apos;s focus is unavailable right now.
      </p>
    );
  }

  if (!payload) {
    return <Skeleton className={cn('h-4 w-64', className)} />;
  }

  const actualMinutes = Math.round(payload.actualFocusMinutes);
  const plannedMinutes = Math.round(payload.plannedFocusMinutes);
  const sessions = payload.today.sessions;
  const completedSessions = payload.today.completedSessions;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs font-medium">Time focused</p>
          <p className="text-foreground mt-1 font-mono text-3xl font-bold tabular-nums tracking-tight">
            {formatFocusDuration(actualMinutes)}
          </p>
        </div>
        {payload.streakDays > 0 && (
          <span className="border-accent-streak/20 bg-accent-streak/10 text-accent-streak inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold">
            <Flame className="h-4 w-4" aria-hidden="true" />
            <span className="font-mono tabular-nums">{payload.streakDays}</span>
            <span className="text-xs">day streak</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="border-border/60 bg-background/55 rounded-2xl border p-3">
          <p className="text-muted-foreground text-[0.68rem] font-semibold uppercase tracking-wider">
            Plan
          </p>
          <p className="text-foreground mt-1 text-base font-semibold">
            {formatFocusDuration(plannedMinutes)}
          </p>
        </div>
        <div className="border-border/60 bg-background/55 rounded-2xl border p-3">
          <p className="text-muted-foreground text-[0.68rem] font-semibold uppercase tracking-wider">
            Sessions
          </p>
          <p className="text-foreground mt-1 text-base font-semibold">
            {completedSessions}/{sessions}
          </p>
        </div>
      </div>

      {drift && (
        <p
          className={cn(
            'flex items-center gap-1.5 text-xs font-semibold',
            drift.isOver
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-amber-600 dark:text-amber-400',
          )}
        >
          <Target className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{drift.label}</span>
        </p>
      )}

      {plannedMinutes > 0 && (
        <div>
          <div className="text-muted-foreground mb-1.5 flex items-center justify-between text-[0.68rem]">
            <span>Daily progress</span>
            <span className="font-mono tabular-nums">
              {Math.min(100, Math.round((actualMinutes / plannedMinutes) * 100))}%
            </span>
          </div>
          <div className="bg-background/75 h-2.5 overflow-hidden rounded-full">
            <div
              className="from-accent-focus via-accent-streak to-accent-goals ease-out-expo h-full rounded-full bg-gradient-to-r transition-all duration-500"
              style={{
                width: `${Math.min(100, (actualMinutes / plannedMinutes) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default FocusTodaySummary;
