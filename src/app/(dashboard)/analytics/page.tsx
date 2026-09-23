'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { BarChart3, CalendarRange, Flame, Moon, Target, TrendingUp } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { DailyBreakdown } from '@/server/analytics/daily';
import type { WeeklySummary } from '@/server/analytics/weekly';
import type { MonthlySummary } from '@/server/analytics/monthly';
import { Spinner } from '@/components/ui';
import { BarChart } from '@/components/charts/BarChart';

interface DashboardData {
  date: string;
  weekStart: string;
  today: DailyBreakdown;
  week: WeeklySummary;
  month: MonthlySummary;
  // Older API shape used `monthly`; accept both.
  monthly?: MonthlySummary;
}

/**
 * Analytics Page — real data only.
 * Dashboard rollup for today, this week and this month with charts.
 * Accent colors are assigned per metric; charts render gradient fills.
 */
export default function AnalyticsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setError(null);
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
  }, [retryKey]);

  // Accept both `month` (current) and legacy `monthly` shapes; default every
  // nested field so new users with no data never crash.
  const month: MonthlySummary | undefined = data?.month ?? data?.monthly;

  const habitChartData = useMemo(
    () =>
      (data?.week?.habits?.perHabit ?? []).map((habit) => ({
        name: habit.habitName,
        completionRate: habit.completionRate,
      })),
    [data],
  );

  const tierChartData = useMemo(
    () =>
      (month?.scores?.byTier ?? []).map((tier) => ({
        name: tier.tier,
        completionRate: tier.completionRate,
      })),
    [month],
  );

  if (error) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
        <button
          onClick={() => setRetryKey((k) => k + 1)}
          className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
        >
          Retry
        </button>
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

  const { today, week } = data;
  if (!month) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Analytics data was incomplete. Please try again.
        </p>
        <button
          onClick={() => setRetryKey((k) => k + 1)}
          className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
        >
          Retry
        </button>
      </div>
    );
  }

  const todayScore = today?.score?.total;
  const todayPct = todayScore != null ? Math.min(todayScore, 100) : 0;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <span className="inline-flex rounded-2xl bg-primary/10 p-2 text-primary">
            <BarChart3 className="h-7 w-7" />
          </span>
          <span className="animated-gradient-text">Analytics</span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          How you are doing today, this week and this month.
        </p>
      </div>

      {/* Bento hero — mixed-size cards, one accent per metric */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Today — hero, spans 2 columns */}
        <section className="glass-panel glow-primary relative overflow-hidden rounded-2xl p-6 shadow-soft lg:col-span-2">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
            aria-hidden="true"
          />

          <p className="shimmer-active inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
            Today
          </p>

          <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative h-32 w-32 shrink-0 rounded-full">
              <div
                className="conic-gradient-ring absolute inset-0 rounded-full"
                style={{ '--p': `${todayPct}%` } as CSSProperties}
                aria-hidden="true"
              />
              <div className="absolute inset-1.5 flex items-center justify-center rounded-full glass-panel shadow-soft">
                <span className="text-3xl font-black tabular-nums text-foreground">
                  {todayScore != null ? Math.round(todayScore) : '—'}
                </span>
              </div>
            </div>

            <div className="flex-1 space-y-3">
              <p className="text-sm text-muted-foreground">
                {today?.score?.grade != null ? `Grade ${today.score.grade}` : 'No score yet'}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Core', value: today?.score?.core, accent: 'text-sky-400 bg-sky-400/10' },
                  { label: 'Growth', value: today?.score?.growth, accent: 'text-violet-400 bg-violet-400/10' },
                  { label: 'Bonus', value: today?.score?.bonus, accent: 'text-amber-400 bg-amber-400/10' },
                  { label: 'Habit reliability', value: today?.habitReliability, accent: 'text-emerald-400 bg-emerald-400/10' },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl bg-card/70 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                      {item.value !== null && item.value !== undefined ? Math.round(item.value) : '—'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border/60 bg-card/60 p-3">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Routine</dt>
              <dd className="mt-1 font-semibold tabular-nums text-foreground">
                {today?.routine?.completionRate != null ? `${Math.round(today.routine.completionRate)}%` : '—'}
              </dd>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-3">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Habits</dt>
              <dd className="mt-1 font-semibold tabular-nums text-foreground">
                {(today?.habits ?? []).filter((h) => h.status === 'COMPLETED').length}/
                {(today?.habits ?? []).length}
              </dd>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-3">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Sleep</dt>
              <dd className="mt-1 flex items-center gap-1 font-semibold tabular-nums text-foreground">
                <Moon className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                {today?.sleep?.durationMinutes != null
                  ? `${Math.round(today.sleep.durationMinutes / 60)}h`
                  : '—'}
              </dd>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-3">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Mood</dt>
              <dd className="mt-1 font-semibold tabular-nums text-foreground">
                {today?.reflection?.mood != null ? `${today.reflection.mood}/5` : '—'}
              </dd>
            </div>
          </dl>
        </section>

        {/* Side rail — week, month, streak */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 lg:grid-cols-1">
          <SideStat
            icon={<CalendarRange className="h-4 w-4" />}
            tag="This week"
            label="Average score"
            value={week?.scores ? String(Math.round(week.scores.average ?? 0)) : '—'}
            hint={`${week?.scores?.excellentDays ?? 0} excellent days`}
            accentClass="from-emerald-500/80 to-emerald-500"
            glowClass="text-emerald-400 bg-emerald-500/10"
          />
          <SideStat
            icon={<TrendingUp className="h-4 w-4" />}
            tag="This month"
            label="Average score"
            value={month?.scores ? String(Math.round(month.scores.average ?? 0)) : '—'}
            hint={`${month?.scores?.perfectDays ?? 0} perfect days`}
            accentClass="from-amber-500/80 to-amber-500"
            glowClass="text-amber-400 bg-amber-500/10"
          />
          <SideStat
            icon={<Flame className="h-4 w-4" />}
            tag="Streak"
            label="Current streak"
            value={`${week?.streaks?.current ?? 0} day${(week?.streaks?.current ?? 0) === 1 ? '' : 's'}`}
            hint={`Longest ${week?.streaks?.longest ?? 0}`}
            accentClass="from-rose-500/80 to-rose-500"
            glowClass="text-rose-400 bg-rose-500/10"
          />
        </div>
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-foreground">Weekly habit consistency</h2>
          {habitChartData.length > 0 ? (
            <div className="mt-4 h-72">
              <BarChart
                data={habitChartData}
                xKey="name"
                dataKey="completionRate"
                height={288}
                ariaLabel="Weekly habit completion rate by habit"
                gradient={{ id: 'habitGradient', from: '#10b981', to: '#059669' }}
              />
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No habit activity this week.
            </p>
          )}
        </section>

        <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-foreground">Monthly tier completion</h2>
          {tierChartData.length > 0 ? (
            <div className="mt-4 h-72">
              <BarChart
                data={tierChartData}
                xKey="name"
                dataKey="completionRate"
                height={288}
                ariaLabel="Monthly completion rate by habit tier"
                gradient={{ id: 'tierGradient', from: '#8b5cf6', to: '#6d28d9' }}
              />
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No tier data this month.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function SideStat({
  icon,
  tag,
  label,
  value,
  hint,
  accentClass,
  glowClass,
}: {
  icon: ReactNode;
  tag: string;
  label: string;
  value: string;
  hint: string;
  accentClass: string;
  glowClass: string;
}) {
  return (
    <section className="glass-panel spotlight-hover relative overflow-hidden rounded-2xl p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ${glowClass}`}
        >
          {icon}
          {tag}
        </span>
        <div
          className={`h-1.5 w-16 rounded-full bg-gradient-to-r ${accentClass} opacity-80`}
          aria-hidden="true"
        />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-4xl font-black tabular-nums text-foreground">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </section>
  );
}