'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { CalendarDays, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTodayString } from '@/lib/dates';
import { shiftAnchor, type Period } from '@/lib/period-range';
import { PeriodControl } from '@/components/shared/PeriodControl';
import DailyRecap from '@/components/recap/DailyRecap';
import WeeklyRecap from '@/components/recap/WeeklyRecap';
import MonthlyRecap from '@/components/recap/MonthlyRecap';
import YearlyRecap from '@/components/recap/YearlyRecap';
import BestDayCard from '@/components/recap/BestDayCard';
import MilestoneCard, { type Milestone } from '@/components/recap/MilestoneCard';
import ShareRecapCard, { type ShareStat } from '@/components/recap/ShareRecapCard';
import TrendCard from '@/components/recap/TrendCard';
import HabitHeatmapCard from '@/components/recap/HabitHeatmapCard';
import SleepTrendCard from '@/components/recap/SleepTrendCard';
import MoodEnergyCard from '@/components/recap/MoodEnergyCard';
import FocusBreakdownCard from '@/components/recap/FocusBreakdownCard';
import GoalsProgressCard from '@/components/recap/GoalsProgressCard';
import TaskThroughputCard from '@/components/recap/TaskThroughputCard';
import NutritionHealthCard from '@/components/recap/NutritionHealthCard';
import StreakMilestonesCard from '@/components/recap/StreakMilestonesCard';
import LinkedReviewCard from '@/components/recap/LinkedReviewCard';
import JournalCard from '@/components/recap/JournalCard';
import RoutineExceptionsCard from '@/components/recap/RoutineExceptionsCard';
import MilestoneHitsCard from '@/components/recap/MilestoneHitsCard';
import ReflectionNarrativesCard from '@/components/recap/ReflectionNarrativesCard';
import type { RecapReport } from '@/types/recap';
import type { RecapExtras } from '@/types/recap';

/**
 * Recap page — real data only.
 * Day / Week / Month / Year periods fetched from /api/recap, rendered with per-period
 * recap cards, a score trend, celebratory best-day and milestone cards, highlighted
 * wins / focus areas, and a real share-summary card. Period navigation is shared
 * with the dashboard Routine Progress widget via PeriodControl.
 */

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
  const [report, setReport] = useState<RecapReport | null>(null);
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
      setReport(json.data as RecapReport);
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

  const navigate = (delta: number) => setAnchorDate(shiftAnchor(anchorDate, period, delta));

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
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
        <RecapDashboard period={period} report={report} />
      )}
    </div>
  );
}

function RecapDashboard({ period, report }: { period: Period; report: RecapReport }) {
  if (period === 'day' && report.day) {
    return (
      <div className="space-y-6">
        <DailyRecap day={report.day} />
        <Highlights period={period} report={report} />
        {report.extras && <ExtrasGrid extras={report.extras} />}
        <ShareRecapCard periodLabel="Today" stats={dayShareStats(report.day)} />
      </div>
    );
  }

  if (period === 'week' && report.week) {
    const weekRows = report.points.map((point) => ({
      label: format(parseISO(point.date), 'EEE'),
      value: point.totalScore,
    }));
    const best = report.week.scores.bestDay;
    return (
      <div className="space-y-6">
        <WeeklyRecap week={report.week} />
        <TrendCard
          title="Score trend"
          rows={weekRows}
          delta={report.week.trend.delta}
          accent="#10b981"
          className="w-full"
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {best && (
            <BestDayCard
              date={format(parseISO(best.date), 'EEE, MMM d')}
              score={Math.round(best.score)}
              subtitle={
                report.week.habits.mostCompleted
                  ? `Most consistent: ${report.week.habits.mostCompleted.habitName}`
                  : undefined
              }
            />
          )}
          <MilestoneCard milestones={weekMilestones(report.week)} />
        </div>
        {report.extras && <ExtrasGrid extras={report.extras} />}
        <Highlights period={period} report={report} />
        <ShareRecapCard periodLabel={report.label} stats={weekShareStats(report.week)} />
      </div>
    );
  }

  if (period === 'month' && report.month) {
    const monthRows = report.points.map((point) => ({
      label: String(Number(point.date.slice(8))),
      value: point.totalScore,
    }));
    const best = report.month.scores.bestDay;
    return (
      <div className="space-y-6">
        <MonthlyRecap month={report.month} />
        <TrendCard
          title="Daily scores"
          rows={monthRows}
          accent="#f59e0b"
          className="w-full"
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {best && (
            <BestDayCard
              date={format(parseISO(best.date), 'MMM d')}
              score={Math.round(best.score)}
              subtitle={
                report.month.scores.perfectDays > 0
                  ? `${report.month.scores.perfectDays} perfect day${report.month.scores.perfectDays === 1 ? '' : 's'}`
                  : undefined
              }
            />
          )}
          <MilestoneCard milestones={monthMilestones(report.month)} />
        </div>
        {report.extras && <ExtrasGrid extras={report.extras} />}
        <Highlights period={period} report={report} />
        <ShareRecapCard periodLabel={report.label} stats={monthShareStats(report.month)} />
      </div>
    );
  }

  if (period === 'year' && report.year) {
    const yearRows =
      report.year.monthlyScoreTrend?.map((entry) => ({
        label: monthName(entry.month),
        value: entry.averageScore,
      })) ?? [];
    return (
      <div className="space-y-6">
        <YearlyRecap year={report.year} />
        <TrendCard
          title="Monthly average scores"
          rows={yearRows}
          accent="#6366f1"
          headline={`${Math.round(report.year.averageScore)}`}
          className="w-full"
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {report.year.bestMonth && (
            <BestDayCard
              date={report.year.bestMonth.month}
              score={Math.round(report.year.bestMonth.averageScore)}
              subtitle={`${report.year.totalDaysScored} days scored all year`}
            />
          )}
          <MilestoneCard milestones={yearMilestones(report.year)} />
        </div>
        {report.extras && <ExtrasGrid extras={report.extras} />}
        <Highlights period={period} report={report} />
        <ShareRecapCard periodLabel={report.label} stats={yearShareStats(report.year)} />
      </div>
    );
  }

  return null;
}

/* ── Real share stats (never fabricated; 0 superseded by '—' markers) ─────── */

/**
 * Extras grid — the per-period enrichment cards. Every card renders its own
 * empty state from the real data it receives; sections with no rows stay
 * placeholders instead of showing fabricated numbers.
 */
function ExtrasGrid({ extras }: { extras: RecapExtras }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      <HabitHeatmapCard habitHeatmap={extras.habitHeatmap} />
      <SleepTrendCard sleepTrend={extras.sleepTrend} />
      <MoodEnergyCard moodEnergy={extras.moodEnergy} />
      <FocusBreakdownCard focusByCategory={extras.focusByCategory} />
      <GoalsProgressCard goalsDelta={extras.goalsDelta} />
      <TaskThroughputCard taskThroughput={extras.taskThroughput} />
      <NutritionHealthCard nutrition={extras.nutrition} health={extras.health} />
      <StreakMilestonesCard streakEvents={extras.streakEvents} achievements={extras.achievements} />
      <JournalCard journal={extras.journal} />
      <RoutineExceptionsCard exceptions={extras.routineExceptions} />
      <MilestoneHitsCard milestones={extras.milestoneHits} />
      <ReflectionNarrativesCard reflections={extras.reflections} />
      {extras.linkedReview && <LinkedReviewCard linkedReview={extras.linkedReview} />}
    </div>
  );
}

function dayShareStats(day: NonNullable<RecapReport['day']>): ShareStat[] {
  return [
    { label: 'Score', value: day.score.total != null ? String(Math.round(day.score.total)) : '—' },
    { label: 'Habit reliability', value: `${Math.round(day.habitReliability)}%` },
    { label: 'Routine', value: day.routine.total > 0 ? `${Math.round(day.routine.completionRate)}%` : '—' },
    {
      label: 'Sleep',
      value: day.sleep.durationMinutes != null ? formatDuration(day.sleep.durationMinutes) : '—',
    },
  ];
}

function weekShareStats(week: NonNullable<RecapReport['week']>): ShareStat[] {
  return [
    { label: 'Average score', value: String(Math.round(week.scores.average)) },
    { label: 'Habit completion', value: `${Math.round(week.habits.averageCompletionRate)}%` },
    { label: 'Streak', value: `${week.streaks.current} day${week.streaks.current === 1 ? '' : 's'}` },
    {
      label: 'Avg sleep',
      value: week.sleep.loggedDays > 0 ? formatDuration(week.sleep.averageDuration) : '—',
    },
  ];
}

function monthShareStats(month: NonNullable<RecapReport['month']>): ShareStat[] {
  return [
    { label: 'Average score', value: String(Math.round(month.scores.average)) },
    { label: 'Habits completed', value: String(month.habits.totalCompleted) },
    { label: 'Goals completed', value: String(month.goals.completed) },
    {
      label: 'Focus',
      value: `${Math.round(month.focus.totalFocusMinutes / 60)}h`,
    },
  ];
}

function yearShareStats(year: NonNullable<RecapReport['year']>): ShareStat[] {
  return [
    { label: 'Average score', value: String(Math.round(year.averageScore)) },
    { label: 'Days scored', value: String(year.totalDaysScored) },
    { label: 'Habits completed', value: String(year.habits.totalCompleted) },
    { label: 'Longest streak', value: `${year.streaks.longest} days` },
  ];
}

/* ── Real milestones per period ────────────────────────────────────────────── */

function weekMilestones(week: NonNullable<RecapReport['week']>): Milestone[] {
  const milestones: Milestone[] = [];
  if (week.scores.perfectDays > 0) {
    milestones.push({
      label: 'Perfect days',
      value: `${week.scores.perfectDays} day${week.scores.perfectDays === 1 ? '' : 's'} at 100 points`,
      tone: 'score',
    });
  }
  if (week.streaks.longest > 0) {
    milestones.push({
      label: 'Longest streak',
      value: `${week.streaks.longest} days`,
      tone: 'streak',
    });
  }
  if (week.habits.mostCompleted) {
    milestones.push({
      label: 'Most consistent',
      value: `${week.habits.mostCompleted.habitName} (${Math.round(week.habits.mostCompleted.completionRate)}%)`,
      tone: 'habit',
    });
  }
  return milestones;
}

function monthMilestones(month: NonNullable<RecapReport['month']>): Milestone[] {
  const milestones: Milestone[] = [];
  if (month.goals.completed > 0) {
    milestones.push({
      label: 'Goals completed',
      value: String(month.goals.completed),
      tone: 'goal',
    });
  }
  if (month.scores.perfectDays > 0) {
    milestones.push({
      label: 'Perfect days',
      value: `${month.scores.perfectDays} day${month.scores.perfectDays === 1 ? '' : 's'} at 100 points`,
      tone: 'score',
    });
  }
  if (month.habits.totalCompleted > 0) {
    milestones.push({
      label: 'Habit completions',
      value: String(month.habits.totalCompleted),
      tone: 'habit',
    });
  }
  return milestones;
}

function yearMilestones(year: NonNullable<RecapReport['year']>): Milestone[] {
  const milestones: Milestone[] = [];
  if (year.streaks.longest > 0) {
    milestones.push({
      label: 'Longest streak',
      value: `${year.streaks.longest} days`,
      tone: 'streak',
    });
  }
  if (year.goals.completed > 0) {
    milestones.push({
      label: 'Goals completed',
      value: String(year.goals.completed),
      tone: 'goal',
    });
  }
  if (year.habits.totalCompleted > 0) {
    milestones.push({
      label: 'Habit completions',
      value: String(year.habits.totalCompleted),
      tone: 'habit',
    });
  }
  return milestones;
}

/* ── Skeltons + empty states ──────────────────────────────────────────────── */

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
    <div className="glass-panel shadow-soft rounded-2xl p-10 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <h2 className="mt-4 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <Link
        href="/today"
        className="light-sweep glow-neon mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Go to Today
      </Link>
    </div>
  );
}

/* ── Period highlights (wins + watch out) ─────────────────────────────────── */

function Highlights({ period, report }: { period: Period; report: RecapReport }) {
  const day = report.day;
  const week = report.week;
  const month = report.month;
  const year = report.year;

  if (period === 'day' && day) {
    return (
      <div className="glass-panel shadow-soft rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-foreground">Day at a glance</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <HighlightCard
            title="Wins"
            items={day.topMoments}
            empty="No completed highlights yet."
            tone="emerald"
          />
          <HighlightCard
            title="Needs work"
            items={day.bottomMoments}
            empty="Nothing to fix. Nice work!"
            tone="rose"
          />
        </div>
      </div>
    );
  }

  if (period === 'week' && week) {
    const best = week.scores.bestDay;
    const worst = week.scores.worstDay;
    return (
      <div className="glass-panel shadow-soft rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-foreground">Week at a glance</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <HighlightCard
            title="Top moment"
            items={[
              best
                ? `Best day: ${format(parseISO(best.date), 'EEE, MMM d')} (${Math.round(best.score)})`
                : null,
              week.habits.mostCompleted
                ? `Most consistent: ${week.habits.mostCompleted.habitName}`
                : null,
            ].filter((item): item is string => Boolean(item))}
            empty="No score data yet this week."
            tone="emerald"
          />
          <HighlightCard
            title="Watch out"
            items={[
              worst
                ? `Toughest day: ${format(parseISO(worst.date), 'EEE, MMM d')} (${Math.round(worst.score)})`
                : null,
              week.sleep.averageDuration > 0
                ? `Avg sleep ${formatDuration(week.sleep.averageDuration)} / night`
                : null,
              week.trend.delta !== 0
                ? `Score ${week.trend.delta > 0 ? 'up' : 'down'} ${Math.abs(
                    Math.round(week.trend.delta)
                  )} pts vs last week`
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
      <div className="glass-panel shadow-soft rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-foreground">Month at a glance</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <HighlightCard
            title="Highlights"
            items={[
              best
                ? `Best day: ${format(parseISO(best.date), 'MMM d')} (${Math.round(best.score)})`
                : null,
              reliable
                ? `Most reliable: ${reliable.habitName} (${Math.round(reliable.completionRate)}%)`
                : null,
              month.journal.entryCount > 0
                ? `${month.journal.entryCount} journal entries`
                : null,
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
      <div className="glass-panel shadow-soft rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-foreground">Year at a glance</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <HighlightCard
            title="Highlights"
            items={[
              year.bestMonth
                ? `Best month: ${monthName(year.bestMonth.month)} (${Math.round(year.bestMonth.averageScore)})`
                : null,
              year.habits.bestHabit
                ? `Best habit: ${year.habits.bestHabit.habitName}`
                : null,
              year.streaks.longest > 0 ? `Longest streak: ${year.streaks.longest} days` : null,
            ].filter((item): item is string => Boolean(item))}
            empty="No highlights recorded this year."
            tone="emerald"
          />
          <HighlightCard
            title="Watch out"
            items={[
              year.worstMonth
                ? `Toughest month: ${monthName(year.worstMonth.month)} (${Math.round(year.worstMonth.averageScore)})`
                : null,
              year.habits.totalMissed > 0 ? `${year.habits.totalMissed} habit checks missed` : null,
              year.focus.totalSessions > 0
                ? `${formatDuration(year.focus.totalFocusMinutes)} focused this year`
                : null,
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

function HighlightCard({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: string[];
  empty: string;
  tone: 'emerald' | 'rose';
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
      <p className="font-medium text-foreground">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li
              key={item}
              className={cn(
                'flex items-start gap-2 text-sm',
                tone === 'rose'
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-700 dark:text-emerald-300'
              )}
            >
              <span
                className={cn(
                  'mt-0.5',
                  tone === 'rose' ? 'text-rose-500' : 'text-emerald-500'
                )}
              >
                {'\u2022'}
              </span>
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