'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, FileText } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { WeeklySummary } from '@/server/analytics/weekly';
import type { MonthlySummary } from '@/server/analytics/monthly';
import { Button, Card, Input, Spinner } from '@/components/ui';
import { BarChart } from '@/components/charts/BarChart';

type ReportType = 'weekly' | 'monthly';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

/**
 * Reports Page
 * Generate and review weekly or monthly summary reports.
 */
export default function ReportsPage() {
  const [type, setType] = useState<ReportType>('weekly');
  const [date, setDate] = useState(todayIso());
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [monthly, setMonthly] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (reportType: ReportType, reportDate: string) => {
    setLoading(true);
    setError(null);
    try {
      if (reportType === 'weekly') {
        const data = await apiRequest<WeeklySummary>(
          `/api/analytics/reports?type=weekly&date=${reportDate}`,
        );
        setWeekly(data);
        setMonthly(null);
      } else {
        const data = await apiRequest<MonthlySummary>(
          `/api/analytics/reports?type=monthly&date=${reportDate}`,
        );
        setMonthly(data);
        setWeekly(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load(type, date);
  }, [load, type, date]);

  const chartData = useMemo(() => {
    if (type === 'weekly' && weekly) {
      return weekly.habits.perHabit.map((habit) => ({
        name: habit.habitName,
        completionRate: habit.completionRate,
      }));
    }
    if (type === 'monthly' && monthly) {
      return monthly.habits.perHabit.map((habit) => ({
        name: habit.habitName,
        completionRate: habit.completionRate,
      }));
    }
    return [];
  }, [type, weekly, monthly]);

  const switchType = (next: ReportType) => {
    setType(next);
    setDate(next === 'weekly' ? todayIso() : currentMonth());
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <FileText className="h-7 w-7 text-primary" />
          Reports
        </h1>
        <p className="mt-2 text-muted-foreground">Review a detailed summary for any week or month.</p>
      </div>

      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex gap-2">
            <Button
              variant={type === 'weekly' ? 'default' : 'outline'}
              size="sm"
              onClick={() => switchType('weekly')}
            >
              Weekly
            </Button>
            <Button
              variant={type === 'monthly' ? 'default' : 'outline'}
              size="sm"
              onClick={() => switchType('monthly')}
            >
              Monthly
            </Button>
          </div>
          <div className="w-full sm:w-56">
            <Input
              label={type === 'weekly' ? 'Week starting' : 'Month'}
              type={type === 'weekly' ? 'date' : 'month'}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
        </div>
      </Card>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : type === 'weekly' && weekly ? (
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
              <CalendarRange className="h-5 w-5 text-primary" />
              {weekly.period.startDate} – {weekly.period.endDate}
            </h2>
            <Row label="Average score" value={weekly.scores.average} />
            <Row label="Excellent days" value={weekly.scores.excellentDays} />
            <Row label="Perfect days" value={weekly.scores.perfectDays} />
            <Row label="Habit completion" value={`${weekly.habits.averageCompletionRate}%`} />
            <Row label="Active habits" value={weekly.habits.activeCount} />
            <Row label="Goals completed" value={weekly.goals.completed} />
            <Row label="Current streak" value={weekly.streaks.current} />
            <Row label="Sleep logged (days)" value={weekly.sleep.loggedDays} />
          </Card>
        </div>
      ) : type === 'monthly' && monthly ? (
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
              <CalendarRange className="h-5 w-5 text-primary" />
              {monthly.period.startDate} – {monthly.period.endDate}
            </h2>
            <Row label="Average score" value={monthly.scores.average} />
            <Row label="Excellent days" value={monthly.scores.excellentDays} />
            <Row label="Perfect days" value={monthly.scores.perfectDays} />
            <Row label="Habit completion" value={`${monthly.habits.averageCompletionRate}%`} />
            <Row label="Completed" value={monthly.habits.totalCompleted} />
            <Row label="Missed" value={monthly.habits.totalMissed} />
            <Row label="Goals completed" value={monthly.goals.completed} />
            <Row label="Focus minutes" value={monthly.focus.totalFocusMinutes} />
            <Row label="Journal entries" value={monthly.journal.entryCount} />
          </Card>
        </div>
      ) : null}

      {chartData.length > 0 && (
        <Card className="mt-6 p-5">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Habit completion</h2>
          <BarChart
            data={chartData}
            xKey="name"
            dataKey="completionRate"
            height={300}
            ariaLabel="Habit completion rate"
          />
        </Card>
      )}
    </div>
  );
}
