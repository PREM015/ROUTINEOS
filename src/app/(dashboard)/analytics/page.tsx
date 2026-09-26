'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { BarChart3, CalendarRange, Flame, Moon, Target } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { getTodayString } from '@/lib/dates';
import { shiftAnchor, type Period } from '@/lib/period-range';
import { PeriodControl } from '@/components/shared/PeriodControl';
import type { AnalyticsDashboard } from '@/types/analytics';
import { Spinner } from '@/components/ui';
import { BarChart } from '@/components/charts/BarChart';
import StreakPanel from '@/components/analytics/StreakPanel';
import TierMixBar from '@/components/analytics/TierMixBar';
import FocusSummaryCard from '@/components/analytics/FocusSummaryCard';
import TaskQuadrantCard from '@/components/analytics/TaskQuadrantCard';
import ProjectProgressList from '@/components/analytics/ProjectProgressList';
import MoodPulseCard from '@/components/analytics/MoodPulseCard';
import AICalloutCard from '@/components/analytics/AICalloutCard';
import SleepSnapshotCard from '@/components/analytics/SleepSnapshotCard';
import RoutineDetailCard from '@/components/analytics/RoutineDetailCard';
import MilestoneHitsCard from '@/components/recap/MilestoneHitsCard';
import TimeAllocationCard from '@/components/analytics/TimeAllocationCard';
import NutritionHealthCard from '@/components/recap/NutritionHealthCard';
import JournalCard from '@/components/recap/JournalCard';
import AchievementsStrip from '@/components/analytics/AchievementsStrip';

/**
 * Analytics Page — real data only.
 * Day / Week / Month / Year periods fetched from /api/analytics/dashboard and
 * rendered as a period-scoped bento dashboard: score hero, consistency charts,
 * and the widget grid. Period navigation is shared with the Recap page via
 * PeriodControl.
 */

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function chartLabel(period: Period): string {
  if (period === 'day') return 'Habit status today';
  if (period === 'week') return 'Habit consistency';
  if (period === 'month') return 'Habit consistency';
  return 'Habit consistency';
}

function chart2Label(period: Period): string {
  if (period === 'day') return 'Tier completion today';
  if (period === 'week') return 'Tier completion (this month)';
  if (period === 'month') return 'Tier completion';
  return 'Monthly average score';
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('day');
  const [anchorDate, setAnchorDate] = useState<string>(() => getTodayString());
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [dismissedInsightId, setDismissedInsightId] = useState<string | null>(null);

  const load = useCallback(
    async (nextPeriod: Period, anchor: string) => {
      try {
        setError(null);
        const result = await apiRequest<AnalyticsDashboard>(
          `/api/analytics/dashboard?period=${nextPeriod}&date=${anchor}`
        );
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      }
    },
    []
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load(period, anchorDate);
  }, [period, anchorDate, load, retryKey]);

  const navigate = (delta: number) => setAnchorDate(shiftAnchor(anchorDate, period, delta));

  const habitChartData = useMemo(
    () => (data?.chart1 ?? []).map((point) => ({ name: point.name, value: point.value })),
    [data]
  );

  const tierChartData = useMemo(
    () => (data?.chart2 ?? []).map((point) => ({ name: point.name, value: point.value })),
    [data]
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

  const { hero, tiles } = data;
  const today = getTodayString();
  const heroPct = hero.total != null ? Math.min(Math.max(hero.total, 0), 100) : 0;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <span className="inline-flex rounded-2xl bg-primary/10 p-2 text-primary">
              <BarChart3 className="h-7 w-7" />
            </span>
            <span className="animated-gradient-text">Analytics</span>
          </h1>
          <p className="mt-2 text-muted-foreground">
            Your dashboard for <span className="font-semibold text-foreground">{data.range.label}</span>.
          </p>
        </div>

        <PeriodControl
          period={period}
          onPeriodChange={setPeriod}
          label={data.range.label}
          onPrev={() => navigate(-1)}
          onNext={() => navigate(1)}
          onToday={() => setAnchorDate(today)}
        />
      </div>

      {/* Bento hero — mixed-size cards, one accent per metric */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="glass-panel glow-primary relative overflow-hidden rounded-2xl p-6 shadow-soft lg:col-span-2">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
            aria-hidden="true"
          />

          <p className="shimmer-active inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
            {data.range.label}
          </p>

          <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative h-32 w-32 shrink-0 rounded-full">
              <div
                className="conic-gradient-ring absolute inset-0 rounded-full"
                style={{ '--p': `${heroPct}%` } as CSSProperties}
                aria-hidden="true"
              />
              <div className="absolute inset-1.5 flex items-center justify-center rounded-full glass-panel shadow-soft">
                <span className="text-3xl font-black tabular-nums text-foreground">
                  {hero.total != null ? Math.round(hero.total) : '—'}
                </span>
              </div>
            </div>

            <div className="flex-1 space-y-3">
              <p className="text-sm text-muted-foreground">
                {hero.grade != null
                  ? `Grade ${hero.grade}${data.period === 'day' ? '' : ' (average)'}`
                  : 'No score yet'}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Core', value: hero.core, accent: 'text-sky-400 bg-sky-400/10' },
                  { label: 'Growth', value: hero.growth, accent: 'text-violet-400 bg-violet-400/10' },
                  { label: 'Bonus', value: hero.bonus, accent: 'text-amber-400 bg-amber-400/10' },
                  { label: 'Habit reliability', value: hero.habitReliability, accent: 'text-emerald-400 bg-emerald-400/10' },
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
                {tiles.routine != null ? `${Math.round(tiles.routine.completionRate)}%` : '—'}
              </dd>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-3">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Habits</dt>
              <dd className="mt-1 font-semibold tabular-nums text-foreground">
                {tiles.habitCompletion != null ? `${Math.round(tiles.habitCompletion)}% completed` : '—'}
              </dd>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-3">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Sleep</dt>
              <dd className="mt-1 flex items-center gap-1 font-semibold tabular-nums text-foreground">
                <Moon className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                {tiles.sleepMinutes != null
                  ? `${Math.round(tiles.sleepMinutes / 60)}h${data.period === 'day' ? '' : ' avg'}`
                  : '—'}
              </dd>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-3">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Mood</dt>
              <dd className="mt-1 font-semibold tabular-nums text-foreground">
                {tiles.mood != null ? `${tiles.mood}/5` : '—'}
              </dd>
            </div>
          </dl>
        </section>

        {/* Side rail — period stats, streak */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 lg:grid-cols-1">
          <SideStat
            icon={<CalendarRange className="h-4 w-4" />}
            tag={data.range.label}
            label="Average score"
            value={hero.total != null ? String(Math.round(hero.total)) : '—'}
            hint={hero.grade != null ? `Grade ${hero.grade}` : 'No scores yet'}
            accentClass="from-emerald-500/80 to-emerald-500"
            glowClass="text-emerald-400 bg-emerald-500/10"
          />
          <SideStat
            icon={<Moon className="h-4 w-4" />}
            tag="Sleep"
            label="Average per night"
            value={tiles.sleepMinutes != null ? formatDuration(tiles.sleepMinutes) : '—'}
            hint={
              data.sleep?.periodStats?.loggedDays != null
                ? `${data.sleep.periodStats.loggedDays} nights logged`
                : 'No sleep logged'
            }
            accentClass="from-amber-500/80 to-amber-500"
            glowClass="text-amber-400 bg-amber-500/10"
          />
          <SideStat
            icon={<Flame className="h-4 w-4" />}
            tag="Streak"
            label="Current streak"
            value={`${data.streaks.current} day${data.streaks.current === 1 ? '' : 's'}`}
            hint={
              data.streaks.nextMilestone != null
                ? `Next milestone ${data.streaks.nextMilestone}d`
                : `Longest ${data.streaks.longest}`
            }
            accentClass="from-rose-500/80 to-rose-500"
            glowClass="text-rose-400 bg-rose-500/10"
          />
        </div>
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-foreground">{chartLabel(period)}</h2>
          {habitChartData.length > 0 ? (
            <div className="mt-4 h-72">
              <BarChart
                data={habitChartData}
                xKey="name"
                dataKey="value"
                height={288}
                ariaLabel={`${chartLabel(period)} chart`}
                gradient={{ id: 'habitGradient', from: '#10b981', to: '#059669' }}
              />
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No habit activity in this period.
            </p>
          )}
        </section>

        <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-foreground">{chart2Label(period)}</h2>
          {tierChartData.length > 0 ? (
            <div className="mt-4 h-72">
              <BarChart
                data={tierChartData}
                xKey="name"
                dataKey="value"
                height={288}
                ariaLabel={`${chart2Label(period)} chart`}
                gradient={{ id: 'tierGradient', from: '#8b5cf6', to: '#6d28d9' }}
              />
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No tier data in this period.
            </p>
          )}
        </section>
      </div>

      {/* Widget grid — each tile renders its own empty state from real data */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <StreakPanel streaks={data.streaks} />
        <TierMixBar tierMix={data.tierMix} />
        <FocusSummaryCard focus={data.focus} periodLabel={data.range.label} />
        <TimeAllocationCard allocation={data.timeAllocation} />
        <RoutineDetailCard routine={data.routine} />
        <TaskQuadrantCard tasks={data.tasks} />
        <ProjectProgressList projects={data.projects} />
        <MilestoneHitsCard milestones={data.milestones} title="Milestones" accent="emerald" />
        <SleepSnapshotCard sleep={data.sleep} />
        <NutritionHealthCard nutrition={data.nutrition} health={data.health} />
        <JournalCard journal={data.journal} />
        <AchievementsStrip achievements={data.achievements} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MoodPulseCard moodPulse={data.moodPulse} />
        <div>
          <AICalloutCard
            insight={data.aiInsight && data.aiInsight.id !== dismissedInsightId ? data.aiInsight : null}
            onDismiss={(id) => setDismissedInsightId(id)}
          />
        </div>
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