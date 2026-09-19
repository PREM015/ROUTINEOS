"use client";

/**
 * WellnessStats — a wellness dashboard: a summary of the last 30 days pulled
 * from GET /api/wellness/stats (mood, energy patterns, sleep, insights) plus a
 * current check-in streak computed from GET /api/wellness/mood logs.
 *
 * Usage:
 *   <WellnessStats />
 */
import * as React from 'react';
import {
  Activity,
  BedDouble,
  CalendarDays,
  Flame,
  HeartPulse,
  Lightbulb,
  Smile,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { MoodAnalysisResult } from '@/lib/wellness/mood-analytics';
import type { EnergyPatternResult } from '@/lib/wellness/energy-patterns';
import type { SleepAnalysisResult } from '@/server/domain/sleep/sleep-analyzer';
import type { WellnessInsight } from '@/lib/wellness/insights';
import { apiRequest } from '@/lib/api-client';
import { Card, Spinner } from '@/components/ui';
import EnergyChart from './EnergyChart';
import SleepChart from './SleepChart';
import { cn } from '@/lib/utils';

export interface WellnessStatsPayload {
  period: { startDate: string; endDate: string; daysAnalyzed: number };
  mood: MoodAnalysisResult;
  energy: EnergyPatternResult;
  sleep: SleepAnalysisResult;
  correlations: { moodWithSleep: unknown | null };
  insights: WellnessInsight[];
  /** Computed client-side from the raw mood logs. */
  streak?: number;
}

export interface WellnessStatsProps {
  className?: string;
}

interface MoodLogLite {
  timestamp: string;
  mood: number;
  energy?: number | null;
}

function dateKey(value: string): string {
  return value.slice(0, 10);
}

function computeStreak(logs: MoodLogLite[]): number {
  const dates = new Set(logs.map((log) => dateKey(log.timestamp)));
  if (dates.size === 0) return 0;

  const today = new Date();
  const cursor = new Date(today);
  if (!dates.has(dateKey(cursor.toISOString()))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (dates.has(dateKey(cursor.toISOString()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const INSIGHT_TONE_STYLES: Record<WellnessInsight['tone'], string> = {
  positive: 'border-green-200 bg-green-50 text-green-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
};

export default function WellnessStats({ className }: WellnessStatsProps) {
  const [stats, setStats] = React.useState<WellnessStatsPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [payload, moodLogs] = await Promise.all([
          apiRequest<WellnessStatsPayload>('/api/wellness/stats'),
          apiRequest<MoodLogLite[]>('/api/wellness/mood', { query: { limit: '100' } }),
        ]);
        if (cancelled) return;
        const streak = computeStreak(moodLogs);
        setStats({ ...payload, streak });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load wellness stats');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className={cn('flex justify-center py-16', className)}>
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className={cn('text-center text-sm text-red-600', className)}>
        {error}
      </p>
    );
  }

  if (!stats) {
    return (
      <p className={cn('text-center text-sm text-gray-500', className)}>
        No wellness data yet — start logging mood, energy, and sleep.
      </p>
    );
  }

  const { mood, energy, sleep, period, insights } = stats;
  const streak = stats.streak ?? 0;
  const sleepMinutes = Math.round(sleep.averageDuration);
  const sleepHours = `${Math.floor(sleepMinutes / 60)}h ${Math.round(sleepMinutes % 60)}m`;

  const statsCards: readonly {
    label: string;
    value: string;
    hint?: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
  }[] = [
    {
      label: 'Average mood',
      value: mood.averageMood > 0 ? `${mood.averageMood.toFixed(1)} / 5` : '—',
      hint: mood.daysTracked > 0 ? `${mood.daysTracked} day${mood.daysTracked === 1 ? '' : 's'} tracked` : 'No check-ins',
      icon: Smile,
      accent: 'text-pink-600 bg-pink-50',
    },
    {
      label: 'Mood trend',
      value:
        mood.moodTrend.direction === 'IMPROVING'
          ? 'Improving'
          : mood.moodTrend.direction === 'DECLINING'
            ? 'Declining'
            : 'Steady',
      hint: mood.moodTrend.change !== 0 ? `Δ ${mood.moodTrend.change.toFixed(1)}` : undefined,
      icon: TrendingUp,
      accent: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: 'Check-in streak',
      value: `${streak} day${streak === 1 ? '' : 's'}`,
      hint: streak > 0 ? 'Consecutive days' : 'Log today to start one',
      icon: Flame,
      accent: 'text-orange-600 bg-orange-50',
    },
    {
      label: 'Avg energy',
      value: energy.averageEnergy > 0 ? `${energy.averageEnergy.toFixed(1)} / 5` : '—',
      hint: energy.peakHour !== null ? `Peak ~${energy.peakHour}:00` : undefined,
      icon: Zap,
      accent: 'text-amber-600 bg-amber-50',
    },
    {
      label: 'Avg sleep',
      value: sleep.averageDuration > 0 ? sleepHours : '—',
      hint: `Score ${sleep.score}`,
      icon: BedDouble,
      accent: 'text-indigo-600 bg-indigo-50',
    },
    {
      label: 'Days analyzed',
      value: `${period.daysAnalyzed}`,
      hint: `${period.startDate} → ${period.endDate}`,
      icon: CalendarDays,
      accent: 'text-blue-600 bg-blue-50',
    },
  ];

  return (
    <div className={cn('space-y-6', className)}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {statsCards.map(({ label, value, hint, icon: Icon, accent }) => (
          <Card key={label} className="p-4">
            <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg', accent)}>
              <Icon className="h-4 w-4" />
            </span>
            <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-sm font-medium text-gray-500">{label}</p>
            {hint && <p className="text-xs text-gray-400">{hint}</p>}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <EnergyChart data={energy} />
        <SleepChart />
      </div>

      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Lightbulb className="h-5 w-5 text-yellow-500" />
          Insights
        </h3>
        {insights.length > 0 ? (
          <ul className="space-y-2">
            {insights.map((insight, index) => (
              <li
                key={`${insight.title}-${index}`}
                className={cn('rounded-lg border px-4 py-3', INSIGHT_TONE_STYLES[insight.tone])}
              >
                <p className="text-sm font-semibold">{insight.title}</p>
                <p className="mt-0.5 text-sm opacity-90">{insight.message}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Activity className="h-4 w-4" />
            Log a few days of mood, energy, and sleep to unlock personalized insights.
          </p>
        )}
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-gray-400">
        <HeartPulse className="h-3.5 w-3.5" />
        Wellness snapshot for {period.startDate} – {period.endDate}
      </p>
    </div>
  );
}