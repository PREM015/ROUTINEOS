'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Flame, Sparkles } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { StreakAnalytics } from '@/types/analytics';
import { Badge, Button, Card, Spinner } from '@/components/ui';
import CalendarHeatmap from '@/components/charts/Calendar';

function monthIso(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/**
 * Calendar Page
 * A month heatmap of daily scores with streak analytics.
 */
export default function CalendarPage() {
  const [analytics, setAnalytics] = useState<StreakAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiRequest<StreakAnalytics>('/api/analytics/streaks');
        if (!cancelled) setAnalytics(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load calendar');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const scoreByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const day of analytics?.timeline ?? []) {
      map[day.date] = day.score ?? 0;
    }
    return map;
  }, [analytics]);

  const goToMonth = (offset: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Sparkles className="h-7 w-7 text-primary" />
          Calendar
        </h1>
        <p className="mt-2 text-muted-foreground">Your daily scores and streaks at a glance.</p>
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!analytics ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Current streak
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-2xl font-bold text-foreground">
                <Flame className="h-5 w-5 text-orange-500" />
                {analytics.current.total}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Longest streak
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">{analytics.longest.total}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Perfect days
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {analytics.history.perfectDays}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Completed days
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {analytics.history.completedDays}
              </p>
            </Card>
          </div>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h2>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => goToMonth(-1)} aria-label="Previous month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => goToMonth(1)} aria-label="Next month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <CalendarHeatmap
              data={scoreByDate}
              month={monthIso(month)}
              showHeader={false}
              ariaLabel="Daily score calendar heatmap"
            />
          </Card>

          {analytics.milestones.length > 0 && (
            <Card className="mt-6 p-5">
              <h2 className="mb-3 text-lg font-semibold text-foreground">Streak milestones</h2>
              <ul className="flex flex-wrap gap-2">
                {analytics.milestones.map((milestone) => (
                  <li key={`${milestone.type}-${milestone.days}`}>
                    <Badge variant={milestone.celebrated ? 'success' : 'default'}>
                      {milestone.days}-day {milestone.type.replace(/_/g, ' ').toLowerCase()}
                      {milestone.reachedDate ? ` · ${milestone.reachedDate}` : ''}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
