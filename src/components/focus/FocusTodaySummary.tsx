'use client';

import { useEffect, useMemo, useState } from 'react';
import { Flame, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { Skeleton } from '@/components/ui/Skeleton';

interface StatsPayload {
  days: Array<{ date: string; focusMinutes: number; sessions: number }>;
  today: { date: string; focusMinutes: number; sessions: number };
  streakDays: number;
  plannedFocusMinutes: number;
  actualFocusMinutes: number;
  completedSessions: number;
  plannedSessions: number;
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
          setError(err instanceof ApiError ? err.message : 'Could not load today\'s focus.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [timezone, today]);

  const summary = useMemo(() => {
    if (!payload) return null;
    const plannedMinutes = Math.round(payload.today.focusMinutes);
    const actualMinutes = Math.round(payload.actualFocusMinutes ?? payload.today.focusMinutes);
    const sessions = payload.today.sessions;
    const completedSessions = payload.completedSessions ?? sessions;
    const plannedSessions = payload.plannedSessions ?? sessions;
    const streakDays = payload.streakDays;

    const parts: string[] = [];
    
    // Planned vs Actual
    if (plannedMinutes > 0) {
      parts.push(`Planned ${formatFocusDuration(plannedMinutes)}`);
    }
    if (actualMinutes > 0) {
      parts.push(`Focused ${formatFocusDuration(actualMinutes)}`);
    }
    if (plannedMinutes > 0 && actualMinutes > 0) {
      const diff = actualMinutes - plannedMinutes;
      if (diff > 0) {
        parts.push(`+${formatFocusDuration(diff)} over plan`);
      } else if (diff < 0) {
        parts.push(`${formatFocusDuration(diff)} under plan`);
      }
    }

    // Sessions
    if (sessions > 0) {
      parts.push(`${completedSessions}/${plannedSessions} ${sessions === 1 ? 'session' : 'sessions'}`);
    }

    // Streak
    if (streakDays > 0) {
      parts.push(`${streakDays}-day streak`);
    }

    return parts.join(' · ');
  }, [payload]);

  const drift = useMemo(() => {
    if (!payload) return null;
    const planned = Math.round(payload.today.focusMinutes);
    const actual = Math.round(payload.actualFocusMinutes ?? payload.today.focusMinutes);
    if (planned === 0) return null;
    const diff = actual - planned;
    if (diff === 0) return null;
    return {
      minutes: Math.abs(diff),
      isOver: diff > 0,
      label: diff > 0 ? `${formatFocusDuration(diff)} over plan` : `${formatFocusDuration(-diff)} under plan`,
    };
  }, [payload]);

  if (error) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)} role="status">
        Today&apos;s focus is unavailable right now.
      </p>
    );
  }

  if (!summary) {
    return <Skeleton className={cn('h-4 w-64', className)} />;
  }

  return (
    <div className={cn('space-y-2', className)}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {summary}
        {payload && payload.streakDays > 0 && (
          <span className="flex items-center gap-1">
            <Flame className="h-3.5 w-3.5 text-accent-streak" aria-hidden="true" />
            <span className="font-mono tabular-nums">{payload.streakDays}</span>
          </span>
        )}
      </p>

      {drift && (
        <p className={cn(
          'flex items-center gap-1.5 text-xs font-medium',
          drift.isOver ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
        )}>
          <Target className="h-3 w-3" aria-hidden="true" />
          <span>{drift.label}</span>
        </p>
      )}

      {payload && payload.plannedFocusMinutes > 0 && (
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-focus transition-all duration-500 ease-out-expo"
            style={{
              width: `${Math.min(100, (payload.actualFocusMinutes ?? payload.today.focusMinutes) / payload.plannedFocusMinutes * 100)}%`
            }}
          />
        </div>
      )}
    </div>
  );
}

export default FocusTodaySummary;