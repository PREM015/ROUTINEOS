'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  CalendarDays,
  TrendingUp,
  Flame,
  Moon,
  Target,
  FolderCheck,
  Timer,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTodayString } from '@/lib/dates';
import { shiftAnchor, type Period } from '@/lib/period-range';
import { PeriodControl } from '@/components/shared/PeriodControl';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';

/**
 * Recap page — real data only.
 * Day / Week / Month / Year periods fetched from /api/recap, rendered with a
 * score chart, stat cards, and period highlights. Period navigation is shared
 * with the dashboard Routine Progress widget via PeriodControl.
 */

interface ScorePoint {
  date: string;
  totalScore: number;
  core: number;
  growth: number;
  bonus: number;
}

interface Report {
  period: Period;
  anchorDate: string;
  startDate: string;
  endDate: string;
  label: string;
  hasData: boolean;
  points: ScorePoint[];
  day?: {
    score: {
      total: number | null;
      grade: string | null;
      isMinimumDay: boolean;
      isRestDay: boolean;
    };
    habitReliability: number;
    routine: { completed: number; total: number; completionRate: number };
    sleep: {
      logged: boolean;
      durationMinutes: number | null;
      metTarget: boolean | null;
    };
    tiers: Array<{ tier: string; total: number; completed: number; completionRate: number }>;
    topMoments: string[];
    bottomMoments: string[];
  };
  week?: {
    scores: {
      average: number;
      perfectDays: number;
      excellentDays: number;
      bestDay: { date: string; score: number } | null;
      worstDay: { date: string; score: number } | null;
    };
    habits: {
      averageCompletionRate: number;
      mostCompleted: { habitName: string; completionRate: number } | null;
    };
    sleep: { averageDuration: number; loggedDays: number };
    trend: { previousAverage: number; delta: number };
    streaks: { current: number; longest: number };
  };
  month?: {
    scores: {
      average: number;
      perfectDays: number;
      excellentDays: number;
      bestDay: { date: string; score: number } | null;
      worstDay: { date: string; score: number } | null;
      byTier: Array<{ tier: string; count: number; completionRate: number }>;
    };
    habits: {
      averageCompletionRate: number;
      totalCompleted: number;
      totalMissed: number;
      perHabit: Array<{ habitName: string; completionRate: number; weeklyRates: Array<number | null> }>;
    };
    focus: { totalSessions: number; totalFocusMinutes: number };
    journal: { entryCount: number };
    goals: { completed: number; milestonesHit: number };
    sleep: { averageDuration: number; nightsMeetingTarget: number };
  };
  year?: {
    totalDaysScored: number;
    averageScore: number;
    bestMonth: { month: string; averageScore: number } | null;
    worstMonth: { month: string; averageScore: number } | null;
    monthlyScoreTrend: Array<{ month: string; days: number; averageScore: number }>;
    habits: {
      averageCompletionRate: number;
      totalCompleted: number;
      totalMissed: number;
      bestHabit: { habitName: string; completionRate: number } | null;
    };
    streaks: { current: number; longest: number };
    goals: { completed: number; averageProgress: number };
    focus: { totalSessions: number; totalFocusMinutes: number };
    journal: { entryCount: number };
  };
}

const CHART_TOOLTIP = {
  backgroundColor: '#18181b',
  border: '1px solid #27272a',
  borderRadius: '8px',
  color: '#ffffff',
} as const;

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function monthName(monthKey: string): string {
  return format(parseISO(`${monthKey}-15`), 'MMM');
}

export default function RecapPage() {
  const [period, setPeriod] = useState<Period>('week');
  const [anchorDate, setAnchorDate] = useState<string>(() => getTodayString());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestId = useRef(0);

  const today = useMemo(() => getTodayString(), []);

  const load = useCallback(async (nextPeriod: Period, anchor: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/recap?period=${nextPeriod}&date=${anchor}`);
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error('Failed to load recap');
      if (requestId.current !== id) return;
      setReport(json.data as Report);
    } catch {
      if (requestId.current !== id) return;
      setError(true);
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load(period, anchorDate);
  }, [period, anchorDate, load]);

  const navigate = (delta: number) =>
    setAnchorDate(shiftAnchor(anchorDate, period, delta));

  return (
    <DashboardLayout>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recap</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review how your habits, routine, sleep and scores evolved.
          </p>
        </div>

        <PeriodControl
          period={period}
          onPeriodChange={(p) => setPeriod(p)}
          label={report?.label ?? '\u2014'}
          onPrev={() => navigate(-1)}
          onNext={() => navigate(1)}
          onToday={() => setAnchorDate(today)}
        />
      </div>

      {loading ? (
        <SkeletonGrid />
      ) : error ? (
        <EmptyState
          icon={<TrendingUp className="mx-auto h-10 w-10 opacity-50" />}
          title="Couldn't load your recap"
          body="Please try again in a moment."
        />
      ) : !report?.hasData ? (
        <EmptyState
          icon={<CalendarDays className="mx-auto h-10 w-10 opacity-50" />}
          title="No recap data available for this period."
          body="Log habits, complete your routine, and track sleep to build your recap."
        />
      ) : (
        <div className="space-y-6">
          <StatGrid period={period} report={report} />
          <ScoreChart period={period} report={report} />
          <Highlights period={period} report={report} />
        </div>
      )}
    </DashboardLayout>
  );
}

function SkeletonGrid() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-muted" />
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-10 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <h2 className="mt-4 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <Link
        href="/today"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Go to Today
      </Link>
    </div>
  );
}

function Stat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 inline-flex rounded-xl p-2 bg-primary/10 text-primary">
        {icon}
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-foreground tabular-nums">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function StatGrid({ period, report }: { period: Period; report: Report }) {
  const day = report.day;
  const week = report.week;
  const month = report.month;
  const year = report.year;

  if (period === 'day' && day) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={<TrendingUp size={18} />}
          label="Daily score"
          value={day.score.total != null ? String(Math.round(day.score.total)) : '--'}
          detail={`Grade: ${day.score.grade ?? 'N/A'}${day.score.isMinimumDay ? ' \u00b7 Minimum day' : ''}${day.score.isRestDay ? ' \u00b7 Rest day' : ''}`}
        />
        <Stat
          icon={<Sparkles size={18} />}
          label="Habit reliability"
          value={`${Math.round(day.habitReliability)}%`}
          detail={`${day.routine.total} routine blocks, ${day.routine.completed} completed`}
        />
        <Stat
          icon={<Moon size={18} />}
          label="Sleep"
          value={day.sleep.durationMinutes != null ? formatDuration(day.sleep.durationMinutes) : '--'}
          detail={day.sleep.logged ? (day.sleep.metTarget ? 'Target met' : 'Below target') : 'Not logged'}
        />
        <Stat
          icon={<Target size={18} />}
          label="Routine"
          value={day.routine.total > 0 ? `${Math.round(day.routine.completionRate)}%` : '--'}
          detail={day.routine.total > 0 ? `${day.routine.completed} of ${day.routine.total} blocks` : 'Nothing scheduled'}
        />
      </div>
    );
  }

  if (period === 'week' && week) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<TrendingUp size={18} />} label="Average score" value={String(Math.round(week.scores.average))} detail={`${week.scores.perfectDays} perfect, ${week.scores.excellentDays} excellent days`} />
        <Stat icon={<Sparkles size={18} />} label="Habit completion" value={`${Math.round(week.habits.averageCompletionRate)}%`} detail={week.habits.mostCompleted ? `Best: ${week.habits.mostCompleted.habitName}` : 'No habit activity'} />
        <Stat icon={<Moon size={18} />} label="Avg sleep" value={week.sleep.averageDuration > 0 ? formatDuration(week.sleep.averageDuration) : '--'} detail={`${week.sleep.loggedDays} nights logged`} />
        <Stat icon={<Flame size={18} />} label="Streak" value={`${week.streaks.current} days`} detail={week.trend.delta !== 0 ? `vs last week: ${week.trend.delta > 0 ? '+' : ''}${Math.round(week.trend.delta)} pts` : 'Even with last week'} />
      </div>
    );
  }

  if (period === 'month' && month) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<TrendingUp size={18} />} label="Average score" value={String(Math.round(month.scores.average))} detail={`${month.scores.perfectDays} perfect, ${month.scores.excellentDays} excellent days`} />
        <Stat icon={<Sparkles size={18} />} label="Habit completion" value={`${Math.round(month.habits.averageCompletionRate)}%`} detail={`${month.habits.totalCompleted} completed, ${month.habits.totalMissed} missed`} />
        <Stat icon={<Timer size={18} />} label="Focus time" value={formatDuration(month.focus.totalFocusMinutes)} detail={`${month.focus.totalSessions} sessions`} />
        <Stat icon={<FolderCheck size={18} />} label="Goals" value={String(month.goals.completed)} detail={`${month.goals.milestonesHit} milestones hit`} />
      </div>
    );
  }

  if (period === 'year' && year) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<TrendingUp size={18} />} label="Average score" value={String(Math.round(year.averageScore))} detail={`${year.totalDaysScored} days scored`} />
        <Stat icon={<Sparkles size={18} />} label="Habit completion" value={`${Math.round(year.habits.averageCompletionRate)}%`} detail={`${year.habits.totalCompleted} completions`} />
        <Stat icon={<Timer size={18} />} label="Focus time" value={formatDuration(year.focus.totalFocusMinutes)} detail={`${year.focus.totalSessions} sessions`} />
        <Stat icon={<BookOpen size={18} />} label="Journal entries" value={String(year.journal.entryCount)} detail={`${year.goals.completed} goals completed`} />
      </div>
    );
  }

  return null;
}

function ScoreChart({ period, report }: { period: Period; report: Report }) {
  const rows = useMemo(() => {
    if (period === 'year') {
      return report.year?.monthlyScoreTrend?.map((entry) => ({
        label: monthName(entry.month),
        score: entry.averageScore,
      }));
    }
    return report.points.map((point) => ({
      label: period === 'month' ? String(Number(point.date.slice(8))) : format(parseISO(point.date), 'EEE'),
      score: point.totalScore,
    }));
  }, [period, report]);

  if (period === 'day') {
    const day = report.day;
    if (!day) return null;
    const score = report.points[0] ?? { core: 0, growth: 0, bonus: 0 };
    const segments = [
      { key: 'core', name: 'Core', value: score.core, color: '#0ea5e9' },
      { key: 'growth', name: 'Growth', value: score.growth, color: '#8b5cf6' },
      { key: 'bonus', name: 'Bonus', value: score.bonus, color: '#f59e0b' },
    ].filter((segment) => segment.value > 0);
    const maxBar = Math.max(segments.reduce((sum, s) => sum + s.value, 0), 100);

    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-5 text-lg font-semibold text-foreground">Daily score breakdown</h2>
        <div className="flex h-8 w-full overflow-hidden rounded-lg bg-muted">
          {segments.map((segment) => (
            <div
              key={segment.key}
              className="h-full transition-colors"
              style={{
                width: `${(segment.value / maxBar) * 100}%`,
                backgroundColor: segment.color,
              }}
              title={`${segment.name}: ${Math.round(segment.value)}`}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
          {segments.length === 0 ? (
            <span>No score data for this day.</span>
          ) : (
            segments.map((segment) => (
              <span key={segment.key} className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                {segment.name}: <span className="text-foreground tabular-nums">{Math.round(segment.value)}</span>
              </span>
            ))
          )}
        </div>
        {day.tiers.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {day.tiers.map((tier) => (
              <div key={tier.tier} className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground capitalize">{tier.tier.toLowerCase()}</span>
                  <span className="text-muted-foreground tabular-nums">{tier.completed}/{tier.total}</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${tier.completionRate}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">{Math.round(tier.completionRate)}% done</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Score trend</h2>
        <p className="mt-4 text-center text-sm text-muted-foreground">No scores for this period.</p>
      </div>
    );
  }

  const isMonth = period === 'month';
  const isYear = period === 'year';

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-5 text-lg font-semibold text-foreground">
        {period === 'year' ? 'Monthly average scores' : 'Score trend'}
      </h2>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {(() => {
            if (isYear) {
              return (
                <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="recapYearFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                  <XAxis dataKey="label" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={{ color: '#a1a1aa' }} itemStyle={{ color: '#fff' }} />
                  <Area type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2.5} fill="url(#recapYearFill)" name="Avg score" />
                </AreaChart>
              );
            }
            if (isMonth) {
              return (
                <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                  <XAxis dataKey="label" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={{ color: '#a1a1aa' }} itemStyle={{ color: '#fff' }} />
                  <Bar dataKey="score" name="Score" radius={[3, 3, 0, 0]}>
                    {rows.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.score >= 85 ? '#10b981' : entry.score >= 60 ? '#f59e0b' : '#f43f5e'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              );
            }
            return (
              <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="recapWeekFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                <XAxis dataKey="label" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={{ color: '#a1a1aa' }} itemStyle={{ color: '#fff' }} />
                <Area type="monotone" dataKey="score" stroke="#10b981" strokeWidth={2.5} fill="url(#recapWeekFill)" name="Score" />
              </AreaChart>
            );
          })()}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Highlights({ period, report }: { period: Period; report: Report }) {
  const day = report.day;
  const week = report.week;
  const month = report.month;
  const year = report.year;

  if (period === 'day' && day) {
    const wins = day.topMoments;
    const focus = day.bottomMoments;
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Day at a glance</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <HighlightCard title="Wins" items={wins} empty="No completed highlights yet." tone="emerald" />
          <HighlightCard title="Needs work" items={focus} empty="Nothing to fix. Nice work!" tone="rose" />
        </div>
      </div>
    );
  }

  if (period === 'week' && week) {
    const best = week.scores.bestDay;
    const worst = week.scores.worstDay;
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Week at a glance</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <HighlightCard
            title="Top moment"
            items={[
              best ? `Best day: ${format(parseISO(best.date), 'EEE, MMM d')} (${Math.round(best.score)})` : null,
              week.habits.mostCompleted ? `Most consistent: ${week.habits.mostCompleted.habitName}` : null,
            ].filter((item): item is string => Boolean(item))}
            empty="No score data yet this week."
            tone="emerald"
          />
          <HighlightCard
            title="Watch out"
            items={[
              worst ? `Toughest day: ${format(parseISO(worst.date), 'EEE, MMM d')} (${Math.round(worst.score)})` : null,
              week.sleep.averageDuration > 0 ? `Avg sleep ${formatDuration(week.sleep.averageDuration)} / night` : null,
              week.trend.delta !== 0
                ? `Score ${week.trend.delta > 0 ? 'up' : 'down'} ${Math.abs(Math.round(week.trend.delta))} pts vs last week`
                : null,
            ].filter((item): item is string => Boolean(item))}
            empty="No data to highlight this week."
            tone="rose"
          />
        </div>
      </div>
    );
  }

  if (period === 'month' && month) {
    const best = month.scores.bestDay;
    const reliable = month.habits.perHabit
      .filter((habit) => habit.weeklyRates.some((rate) => rate !== null))
      .sort((a, b) => b.completionRate - a.completionRate)[0];
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Month at a glance</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <HighlightCard
            title="Highlights"
            items={[
              best ? `Best day: ${format(parseISO(best.date), 'MMM d')} (${Math.round(best.score)})` : null,
              reliable ? `Most reliable: ${reliable.habitName} (${Math.round(reliable.completionRate)}%)` : null,
              month.journal.entryCount > 0 ? `${month.journal.entryCount} journal entries` : null,
            ].filter((item): item is string => Boolean(item))}
            empty="Nothing notable recorded this month."
            tone="emerald"
          />
          <HighlightCard
            title="Focus areas"
            items={[
              month.focus.totalSessions > 0
                ? `${formatDuration(month.focus.totalFocusMinutes)} focused in ${month.focus.totalSessions} sessions`
                : null,
              month.sleep.averageDuration > 0
                ? `Avg sleep ${formatDuration(month.sleep.averageDuration)} / night`
                : null,
              month.habits.totalMissed > 0 ? `${month.habits.totalMissed} habit checks missed` : null,
            ].filter((item): item is string => Boolean(item))}
            empty="No data for a focus summary yet."
            tone="rose"
          />
        </div>
      </div>
    );
  }

  if (period === 'year' && year) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Year at a glance</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <HighlightCard
            title="Highlights"
            items={[
              year.bestMonth ? `Best month: ${monthName(year.bestMonth.month)} (${Math.round(year.bestMonth.averageScore)})` : null,
              year.habits.bestHabit ? `Best habit: ${year.habits.bestHabit.habitName}` : null,
              year.streaks.longest > 0 ? `Longest streak: ${year.streaks.longest} days` : null,
            ].filter((item): item is string => Boolean(item))}
            empty="No highlights recorded this year."
            tone="emerald"
          />
          <HighlightCard
            title="Watch out"
            items={[
              year.worstMonth ? `Toughest month: ${monthName(year.worstMonth.month)} (${Math.round(year.worstMonth.averageScore)})` : null,
              year.habits.totalMissed > 0 ? `${year.habits.totalMissed} habit checks missed` : null,
              year.focus.totalSessions > 0 ? `${formatDuration(year.focus.totalFocusMinutes)} focused this year` : null,
            ].filter((item): item is string => Boolean(item))}
            empty="No data for a summary yet."
            tone="rose"
          />
        </div>
      </div>
    );
  }

  return null;
}

function HighlightCard({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: 'emerald' | 'rose' }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <p className="font-medium text-foreground">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li
              key={item}
              className={cn(
                'flex items-start gap-2 text-sm',
                tone === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-300'
              )}
            >
              <span className="mt-0.5">{tone === 'rose' ? '\u2022' : '\u2022'}</span>
              <span className="text-muted-foreground">{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}