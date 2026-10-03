'use client';

/**
 * DaySummary — one quiet line about today.
 *
 * "Today 2h 05m · 4 sessions · 6-day streak".
 *
 * It exists to answer "am I doing this?" in one glance without becoming a
 * dashboard. The old page spent four stat tiles and a 7-day chart on `/focus`,
 * which is the most valuable screen real estate in the product spent on the least
 * urgent question.
 *
 * Every figure comes from the shared glossary (`lib/focus/metrics.ts`), so this
 * line cannot disagree with the `/analytics` card or the recaps — which is the
 * whole point of having written it.
 */

import { useEffect, useMemo, useState } from 'react';
import { Flame } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ApiError, apiRequest } from '@/lib/api-client';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { Skeleton } from '@/components/ui/Skeleton';

interface StatsPayload {
  days: Array<{ date: string; focusMinutes: number; sessions: number }>;
  today: { date: string; focusMinutes: number; sessions: number };
  streakDays: number;
}

/** "2h 05m". Zero renders as "0m" — a bare "0h 0m" is noise. */
export function formatFocusDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, '0')}m`;
}

export function DaySummary({ className }: { className?: string }) {
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
          setError(err instanceof ApiError ? err.message : 'Could not load today.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [timezone, today]);

  const text = useMemo(() => {
    if (!payload) return null;
    const minutes = Math.round(payload.today.focusMinutes);
    const sessions = payload.today.sessions;
    const parts = [
      `Today ${formatFocusDuration(minutes)}`,
      `${sessions} ${sessions === 1 ? 'session' : 'sessions'}`,
    ];
    if (payload.streakDays > 0) {
      parts.push(`${payload.streakDays}-day streak`);
    }
    return parts.join(' · ');
  }, [payload]);

  if (error) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)} role="status">
        Today&rsquo;s focus is unavailable right now.
      </p>
    );
  }

  if (!text) {
    return <Skeleton className={cn('h-4 w-56', className)} />;
  }

  return (
    <p className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      {text}
      {payload && payload.streakDays > 0 && (
        <Flame
          className="h-3.5 w-3.5 text-accent-streak"
          aria-label={`${payload.streakDays}-day streak`}
        />
      )}
    </p>
  );
}

export default DaySummary;
