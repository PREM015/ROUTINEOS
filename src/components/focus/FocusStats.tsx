'use client';

/**
 * FocusStats — focus session dashboard powered by GET /api/focus?limit=100.
 *
 * Renders stat cards (total sessions, focus minutes today and this week,
 * average duration, current day streak) plus a 7-day bar chart of focus
 * minutes. All aggregation is done client-side from the session list.
 */

import { useEffect, useMemo, useState } from 'react';
import { Activity, Clock, Flame, Timer, TrendingUp } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarChart } from '@/components/charts/BarChart';

interface FocusSessionRow {
  id: string;
  title: string;
  plannedDuration: number;
  actualDuration: number | null;
  startedAt: string;
  completedAt: string | null;
  status: string;
}

interface FocusStat {
  key: string;
  label: string;
  value: string;
  sublabel: string;
  icon: React.ReactNode;
}

function sessionMinutes(session: FocusSessionRow): number {
  return session.actualDuration ?? session.plannedDuration;
}

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShortDay(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
}

function computeStreak(daysWithSessions: ReadonlySet<string>, now: Date): number {
  let cursor = new Date(now);
  if (!daysWithSessions.has(localDayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (daysWithSessions.has(localDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function FocusStats({ className }: { className?: string }) {
  const [sessions, setSessions] = useState<FocusSessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await apiRequest<FocusSessionRow[]>('/api/focus', {
          query: { limit: 100 },
        });
        if (!cancelled) setSessions(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load focus stats.');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    if (!sessions) return null;
    const now = new Date();
    const todayKey = localDayKey(now);

    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 6);
    const weekAgoKey = localDayKey(weekAgo);

    const daysWithSessions = new Set<string>();
    const dayMinutes = new Map<string, number>();

    let todayMinutes = 0;
    let weekMinutes = 0;
    let totalMinutes = 0;

    for (const session of sessions) {
      const started = new Date(session.startedAt);
      const day = localDayKey(started);
      const minutes = sessionMinutes(session);

      daysWithSessions.add(day);
      dayMinutes.set(day, (dayMinutes.get(day) ?? 0) + minutes);
      totalMinutes += minutes;
      if (day === todayKey) todayMinutes += minutes;
      if (day >= weekAgoKey && day <= localDayKey(now)) weekMinutes += minutes;
    }

    const completed = sessions.filter((session) => session.status === 'COMPLETED');
    const averageDuration =
      completed.length === 0 ? 0 : Math.round(totalMinutes / completed.length);

    const chart = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(now);
      day.setDate(now.getDate() - (6 - index));
      const key = localDayKey(day);
      return {
        day: formatShortDay(day),
        minutes: dayMinutes.get(key) ?? 0,
      };
    });

    const streak = computeStreak(daysWithSessions, now);

    return { todayMinutes, weekMinutes, averageDuration, streak, chart, totalSessions: sessions.length };
  }, [sessions]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700" role="alert">
        {error}
      </div>
    );
  }

  if (!sessions) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-28" />
          </Card>
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={<Timer className="h-12 w-12 text-gray-300" />}
        title="No focus sessions yet"
        description="Complete your first focus session to see stats here."
      />
    );
  }

  const statCards: FocusStat[] = [
    {
      key: 'sessions',
      label: 'Total sessions',
      value: stats ? String(stats.totalSessions) : '—',
      sublabel: 'last 100 recorded',
      icon: <Activity className="h-4 w-4 text-blue-600" />,
    },
    {
      key: 'today',
      label: 'Focus minutes today',
      value: stats ? stats.todayMinutes.toLocaleString() : '—',
      sublabel: 'in progress sessions included',
      icon: <Timer className="h-4 w-4 text-green-600" />,
    },
    {
      key: 'week',
      label: 'Focus minutes this week',
      value: stats ? stats.weekMinutes.toLocaleString() : '—',
      sublabel: 'last 7 days',
      icon: <TrendingUp className="h-4 w-4 text-purple-600" />,
    },
    {
      key: 'avg',
      label: 'Avg session length',
      value: stats ? `${stats.averageDuration}m` : '—',
      sublabel: 'completed sessions',
      icon: <Clock className="h-4 w-4 text-amber-600" />,
    },
  ];

  return (
    <div className={cn('space-y-6', className)}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.key} className="p-4">
            <div className="flex items-center gap-2">
              {card.icon}
              <h3 className="text-sm font-medium text-gray-600">{card.label}</h3>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">{card.value}</p>
            <p className="mt-1 text-xs text-gray-500">{card.sublabel}</p>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Flame className="h-4 w-4 text-orange-500" />
        <p className="text-sm text-gray-700">
          {stats && stats.streak > 0 ? (
            <>
              Current streak:{' '}
              <span className="font-semibold text-gray-900">
                {stats.streak} {stats.streak === 1 ? 'day' : 'days'}
              </span>{' '}
              with a focus session
            </>
          ) : (
            'No active streak yet — start a session today to begin one.'
          )}
        </p>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Focus minutes — last 7 days</h3>
          <Badge variant="primary">Per day</Badge>
        </div>
        {stats && stats.chart.some((point) => point.minutes > 0) ? (
          <BarChart
            data={stats.chart}
            xKey="day"
            dataKey="minutes"
            height={220}
            colors={['#3b82f6']}
            ariaLabel="Focus minutes per day for the last 7 days"
          />
        ) : (
          <p className="py-8 text-center text-sm text-gray-400">
            No focus minutes recorded this week.
          </p>
        )}
      </Card>
    </div>
  );
}

export default FocusStats;