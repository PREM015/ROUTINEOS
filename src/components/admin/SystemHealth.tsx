'use client';

/**
 * SystemHealth — admin health dashboard backed by GET /api/admin/analytics.
 *
 * Renders stat cards (users, active users, habits, goals, challenges, feedback)
 * with green/red health colour-coding and a "last checked" timestamp. Includes
 * a manual refresh button and clear loading/error/empty handling.
 */

import { useCallback, useEffect, useState } from 'react';
import { Activity, HeartPulse, RefreshCw, Users } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { cn, getRelativeTime } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

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

interface HealthDatum {
  key: string;
  label: string;
  value: number;
  sublabel: string;
  healthy: boolean;
}

export function SystemHealth() {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const analytics = await apiRequest<AdminAnalytics>('/api/admin/analytics');
      setData(analytics);
      setLastChecked(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system health.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void fetchHealth();
  }, [fetchHealth]);

  const cards: HealthDatum[] = data
    ? [
        { key: 'users', label: 'Total Users', value: data.users.total, sublabel: `${data.users.active30d} active (30d)`, healthy: data.users.total > 0 },
        { key: 'active', label: 'Active Users', value: data.users.active30d, sublabel: 'last 30 days', healthy: data.users.active30d > 0 },
        { key: 'habits', label: 'Habits', value: data.content.habits, sublabel: 'tracked habits', healthy: data.content.habits > 0 },
        { key: 'goals', label: 'Goals', value: data.content.goals.total, sublabel: `${data.content.goals.completed} completed`, healthy: data.content.goals.total > 0 },
        { key: 'challenges', label: 'Challenges', value: data.content.challenges.active, sublabel: `${data.content.challenges.total} total`, healthy: data.content.challenges.active >= 0 },
        { key: 'scores', label: 'Scores', value: data.scores.total, sublabel: 'daily scores recorded', healthy: data.scores.total > 0 },
      ]
    : [];

  return (
    <Card>
      <div className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-bold">System Health</h2>
          </div>
          <div className="flex items-center gap-3">
            {lastChecked && (
              <span className="text-xs text-muted-foreground/70">
                Last checked {getRelativeTime(lastChecked)}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading} isLoading={loading}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="rounded-xl border border-border p-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-3 h-8 w-16" />
                <Skeleton className="mt-2 h-3 w-32" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && data && (
          <>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((card) => (
                <div
                  key={card.key}
                  className={cn(
                    'rounded-xl border p-4 transition-colors',
                    card.healthy ? 'border-green-200 bg-green-50/60' : 'border-red-200 bg-red-50/60'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-muted-foreground">{card.label}</h3>
                    <span
                      className={cn(
                        'h-2.5 w-2.5 rounded-full',
                        card.healthy ? 'bg-green-500' : 'bg-red-500'
                      )}
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
                    {card.value.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{card.sublabel}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground/70" />
                {data.users.byRole.length > 0
                  ? data.users.byRole.map((row) => `${row.role}: ${row.count}`).join(' · ')
                  : 'No role data'}
              </span>
              <span className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-muted-foreground/70" />
                Feedback {data.feedback.resolved} / {data.feedback.total} resolved
              </span>
              {data.period.from && (
                <Badge variant="default">
                  Period {data.period.from} → {data.period.to ?? 'today'}
                </Badge>
              )}
            </div>
          </>
        )}

        {!loading && !error && !data && (
          <div className="mt-5 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No health data available.
          </div>
        )}
      </div>
    </Card>
  );
}

export default SystemHealth;