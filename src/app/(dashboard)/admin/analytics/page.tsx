'use client';

/**
 * Admin Analytics
 * Renders platform analytics from GET /api/admin/analytics: headline stat
 * cards, a users-by-role bar chart and a content overview chart.
 */

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert, ShieldX, Users } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { BarChart } from '@/components/charts/BarChart';

interface AdminAnalytics {
  period: { from: string | null; to: string | null };
  users: {
    total: number;
    active30d: number;
    newInPeriod: number;
    byRole: Array<{ role: string; count: number }>;
  };
  content: {
    habits: number;
    goals: { total: number; completed: number };
    challenges: { total: number; active: number };
  };
  feedback: { total: number; resolved: number };
  scores: { total: number };
}

interface MetricCard {
  label: string;
  value: number;
  sublabel: string;
}

export default function AdminAnalyticsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setFetching(true);
    setError(null);
    try {
      setData(await apiRequest<AdminAnalytics>('/api/admin/analytics'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics.');
      setData(null);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void fetchAnalytics();
  }, [fetchAnalytics]);

  if (isLoading) {
    return (
      <main className="container mx-auto max-w-7xl px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
            <Skeleton key={item} className="h-28 rounded-xl" />
          ))}
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-bold">Sign in required</h1>
            <a
              href="/login"
              className="light-sweep glow-neon mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform duration-300 ease-out-expo hover:scale-[1.02] active:scale-[0.97]"
            >
              Sign in
            </a>
          </div>
        </Card>
      </main>
    );
  }

  if (user.role !== 'ADMIN') {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <ShieldX className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-4 text-xl font-bold">Access denied</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You need administrator privileges to view this page.
            </p>
          </div>
        </Card>
      </main>
    );
  }

  const metrics: MetricCard[] = data
    ? [
        { label: 'Total Users', value: data.users.total, sublabel: 'registered accounts' },
        { label: 'Active Users', value: data.users.active30d, sublabel: 'active in last 30 days' },
        { label: 'New Users', value: data.users.newInPeriod, sublabel: 'added this period' },
        { label: 'Habits', value: data.content.habits, sublabel: 'tracked habits' },
        { label: 'Goals', value: data.content.goals.total, sublabel: `${data.content.goals.completed} completed` },
        { label: 'Challenges', value: data.content.challenges.total, sublabel: `${data.content.challenges.active} active` },
        { label: 'Feedback', value: data.feedback.total, sublabel: `${data.feedback.resolved} resolved` },
        { label: 'Daily Scores', value: data.scores.total, sublabel: 'score records' },
      ]
    : [];

  const roleData =
    data?.users.byRole.map((row) => ({ role: row.role, count: row.count })) ?? [];

  const contentData = data
    ? [
        { label: 'Habits', value: data.content.habits },
        { label: 'Goals', value: data.content.goals.total },
        { label: 'Challenges', value: data.content.challenges.total },
        { label: 'Daily scores', value: data.scores.total },
      ]
    : [];

  return (
    <main className="container mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aggregated platform usage metrics.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAnalytics} disabled={fetching} isLoading={fetching}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mt-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {fetching && !data && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
            <Skeleton key={item} className="h-28 rounded-xl" />
          ))}
        </div>
      )}

      {!fetching && !error && data && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric) => (
              <Card key={metric.label} className="p-5">
                <h3 className="text-sm font-medium text-muted-foreground">{metric.label}</h3>
                <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
                  {metric.value.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{metric.sublabel}</p>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold">Users by Role</h2>
              </div>
              <div className="mt-4">
                <BarChart data={roleData} xKey="role" dataKey="count" height={280} ariaLabel="Users by role" />
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-lg font-bold">Content Overview</h2>
              </div>
              <div className="mt-4">
                <BarChart data={contentData} xKey="label" dataKey="value" height={280} ariaLabel="Content overview" />
              </div>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            {data.period.from && (
              <Badge variant="default">
                Period {data.period.from} → {data.period.to ?? 'today'}
              </Badge>
            )}
            <span>
              Feedback resolved {data.feedback.resolved} / {data.feedback.total}
            </span>
          </div>
        </div>
      )}
    </main>
  );
}