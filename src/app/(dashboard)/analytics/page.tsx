'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BarChart3, CalendarRange, Flame, Target } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { DailyBreakdown } from '@/server/analytics/daily';
import type { WeeklySummary } from '@/server/analytics/weekly';
import type { MonthlySummary } from '@/server/analytics/monthly';
import { Card, Spinner } from '@/components/ui';
import { BarChart } from '@/components/charts/BarChart';

interface DashboardData {
  date: string;
  weekStart: string;
  month: string;
  today: DailyBreakdown;
  week: WeeklySummary;
  month: MonthlySummary;
}

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </Card>
  );
}

/**
 * Analytics Page
 * Dashboard rollup for today, this week and this month with charts.
 */
export default function AnalyticsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await apiRequest<DashboardData>('/api/analytics/dashboard');
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load analytics');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const habitChartData = useMemo(
    () =>
      (data?.week.habits.perHabit ?? []).map((habit) => ({
        name: habit.habitName,
        completionRate: habit.completionRate,
      })),
    [data],
  );

  const tierChartData = useMemo(
    () =>
      (data?.month.scores.byTier ?? []).map((tier) => ({
        name: tier.tier,
        completionRate: tier.completionRate,
      })),
    [data],
  );

  if (error) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const { today, week, month } = data;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <BarChart3 className="h-7 w-7 text-blue-600" />
          Analytics
        </h1>
        <p className="mt-2 text-gray-600">
          How you are doing today, this week and this month.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Today"
          value={today.score.total !== null ? String(Math.round(today.score.total)) : '—'}
          hint={today.score.grade ?? 'No score yet'}
          icon={<Target className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Week average"
          value={String(Math.round(week.scores.average))}
          hint={`${week.scores.excellentDays} excellent days`}
          icon={<CalendarRange className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Month average"
          value={String(Math.round(month.scores.average))}
          hint={`${month.scores.perfectDays} perfect days`}
          icon={<CalendarRange className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Current streak"
          value={String(week.streaks.current)}
          hint={`Longest ${week.streaks.longest}`}
          icon={<Flame className="h-3.5 w-3.5" />}
        />
      </div>

      <Card className="mt-6 p-5">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Today&apos;s breakdown</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Core', value: today.score.core },
            { label: 'Growth', value: today.score.growth },
            { label: 'Bonus', value: today.score.bonus },
            { label: 'Habit reliability', value: today.habitReliability },
          ].map((item) => (
            <div key={item.label} className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {item.label}
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">
                {item.value !== null && item.value !== undefined ? Math.round(item.value) : '—'}
              </p>
            </div>
          ))}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-gray-500">Routine</dt>
            <dd className="font-semibold text-gray-900">{today.routine.completionRate}%</dd>
          </div>
          <div>
            <dt className="text-gray-500">Habits completed</dt>
            <dd className="font-semibold text-gray-900">
              {today.habits.filter((habit) => habit.status === 'COMPLETED').length}/
              {today.habits.length}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Sleep</dt>
            <dd className="font-semibold text-gray-900">
              {today.sleep.durationMinutes !== null
                ? `${Math.round(today.sleep.durationMinutes / 60)}h`
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Mood</dt>
            <dd className="font-semibold text-gray-900">{today.reflection.mood ?? '—'}/5</dd>
          </div>
        </dl>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Weekly habit consistency</h2>
          {habitChartData.length > 0 ? (
            <BarChart
              data={habitChartData}
              xKey="name"
              dataKey="completionRate"
              height={280}
              ariaLabel="Weekly habit completion rate by habit"
            />
          ) : (
            <p className="py-10 text-center text-sm text-gray-500">No habit activity this week.</p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Monthly tier completion</h2>
          {tierChartData.length > 0 ? (
            <BarChart
              data={tierChartData}
              xKey="name"
              dataKey="completionRate"
              height={280}
              ariaLabel="Monthly completion rate by habit tier"
            />
          ) : (
            <p className="py-10 text-center text-sm text-gray-500">No tier data this month.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
