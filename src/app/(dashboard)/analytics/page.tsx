'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  BarChart3,
  BookOpen,
  CalendarRange,
  Flame,
  GitCompareArrows,
  Moon,
  Target,
  TrendingUp,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { usePeriodUrlState } from '@/hooks/usePeriodUrlState';
import { parseCompareAnchor, useComparePeriod } from '@/hooks/useComparePeriod';
import type { AnalyticsDashboard } from '@/types/analytics';
import type { Period } from '@/lib/period-range';
import { deltaText, percentText } from '@/lib/analytics/format';
import { shiftCalendarDay } from '@/lib/dates';
import { AnalyticsSkeleton } from '@/components/analytics/AnalyticsSkeleton';
import { PeriodBar } from '@/components/analytics/PeriodBar';
import { HighlightChips } from '@/components/analytics/HighlightChips';
import { HabitLab } from '@/components/analytics/HabitLab';
import { PeriodControl } from '@/components/shared/PeriodControl';
import { DomainRoom } from '@/components/analytics/DomainRoom';
import { DayContextNote } from '@/components/analytics/DayContextNote';
import { CompareStudio } from '@/components/analytics/CompareStudio';
import { TargetsPanel } from '@/components/analytics/TargetsPanel';
import { ReviewMode } from '@/components/analytics/ReviewMode';
import { ViewsToolbar, useHiddenRooms } from '@/components/analytics/ViewsToolbar';
import { TrendStrip } from '@/components/analytics/TrendStrip';
import { ReportView, ZenView, buildReportModel } from '@/components/analytics/ReportView';
import type { TrendMetric } from '@/lib/analytics/trend';
import { canReview } from '@/lib/analytics/review';

/** The three arrangements of the same data. Anything else in `?view=` falls back. */
type ViewMode = 'standard' | 'zen' | 'report';
import PeriodChart from '@/components/analytics/PeriodChart';
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
 * Analytics — one period, one set of definitions, detail on request.
 *
 * ## What this page is for
 *
 * Answering "how did this period go, and what changed?" and then letting the user
 * drill into whichever domain the answer points at. It is a *reporting* surface,
 * which drives three decisions:
 *
 *  - **The period lives in the URL.** A view of last month's habits is a result,
 *    not a transient UI state, so it is linkable, bookmarkable and back-navigable.
 *  - **Stale data is shown and labelled, never silently.** See
 *    `usePeriodUrlState` for the race guard that stops a slow response from
 *    overwriting a fast one.
 *  - **Domain detail is grouped and collapsible.** Twelve equally-weighted cards
 *    competed for attention and none of them led; the overview now answers the
 *    question first and the detail is one click away.
 *
 * ## Where the numbers come from
 *
 * Every figure is computed server-side in `AnalyticsService`, on one definition
 * per metric. The habit rate in particular is `completed / scheduled` with
 * `scheduled` derived from the eligibility rule — see
 * `lib/analytics/period-habits`, which replaced four denominators that disagreed
 * between the day, week, month and year tabs. This page never derives a rate.
 */

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Id of the reporting panel the period strip drives.
 *
 * A module constant rather than `useId()` because the strip and the panel are
 * siblings in one render, and a generated id would have to be threaded through
 * both. It is stable across renders, so the `aria-controls` relationship
 * survives a period change.
 */
const PERIOD_PANEL_ID = 'analytics-period-panel';

/** What chart 1 shows, per period. The label must match the data's real range. */
function habitChartCopy(period: Period, label: string): { title: string; description: string } {
  if (period === 'day') {
    return {
      title: 'Habits today',
      description: 'How each habit ended on this day.',
    };
  }
  return {
    title: 'Habit consistency',
    description: `Share of due days completed per habit, ${label}.`,
  };
}

function tierChartCopy(period: Period, label: string): { title: string; description: string } {
  if (period === 'year') {
    return {
      title: 'Monthly average score',
      description: `Average score per month across ${label}. Months with no scored day are left empty.`,
    };
  }
  return {
    title: 'Tier completion',
    description: `Share of due days completed, by tier, across ${label}.`,
  };
}

export default function AnalyticsPage() {
  const { today: userToday, timezone } = useUserTimezone();

  const load = useCallback(
    async (period: Period, anchor: string): Promise<AnalyticsDashboard> =>
      apiRequest<AnalyticsDashboard>(`/api/analytics/dashboard?period=${period}&date=${anchor}`),
    []
  );

  const { period, anchorDate, data, error, isLoading, isStale, setPeriod, step, reset, retry } =
    usePeriodUrlState<AnalyticsDashboard>(load, {
      period: 'day',
      today: userToday,
      timezone,
      /*
       * `readWeekStartsOn`, not a value: the hook needs the resolved weekday read back
       * *out* of each loaded payload. Passing `data?.range.weekStartsOn` instead
       * referred to `data` inside the initialiser that produces it, which is a
       * self-reference - `tsc` reports it as an implicit-any cycle, and at runtime the
       * binding would be in its temporal dead zone on first render.
       *
       * There is deliberately no `weekStartsOn` setting here any more: the server
       * resolves the weekday and reports it, so a client-side guess would only be a
       * second answer to the same question.
       */
      readWeekStartsOn: (loaded) => loaded?.range.weekStartsOn,
    });

  const [dismissedInsightId, setDismissedInsightId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('score');

  /*
    The year tab carries monthly score averages only, so a habit trend cannot be shown there.
    Derived rather than reset, so choosing "Habits" on a week tab and stepping to a month
    keeps that choice, and stepping to the year and back does not silently discard it. The
    strip disables the Habits button there rather than showing score numbers under a habit
    caption.
  */
  const effectiveTrendMetric: TrendMetric = period === 'year' ? 'score' : trendMetric;
  const [hiddenRooms, setHiddenRooms] = useHiddenRooms();

  /*
    `cmp` lives in the URL rather than in component state, for the same reason `period`
    does: a comparison is a result the user arrived at and may want to link to or return
    to with the back button. Validated on read — a hand-edited value that is not a real
    calendar date, or is in the future, is dropped rather than sent.
  */
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compareAnchor = parseCompareAnchor(searchParams.get('cmp'), userToday);

  const setCompareAnchor = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === null) params.delete('cmp');
      else params.set('cmp', next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const compare = useComparePeriod(period, anchorDate, compareAnchor);

  // Strip an invalid `cmp` so the address bar always describes what is rendered.
  useEffect(() => {
    const raw = searchParams.get('cmp');
    if (raw !== null && raw !== compareAnchor) setCompareAnchor(null);
  }, [compareAnchor, searchParams, setCompareAnchor]);

  /*
    Hard failure with nothing to show: the retry is the only useful thing on the
    page, so it takes the whole screen rather than being buried under an empty
    dashboard whose zeros look like data.
  */
  /*
    `view` is in the URL for the same reason `period` is: a report someone meant to read
    or print is a result, and it should survive a reload and be linkable. An unrecognised
    value falls back to standard rather than erroring — a bad query parameter should not
    be able to leave the page in a state with no way back.
  */
  const viewParam = searchParams.get('view');
  const view: ViewMode =
    viewParam === 'zen' || viewParam === 'report' ? viewParam : 'standard';

  const setView = useCallback(
    (next: ViewMode) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'standard') params.delete('view');
      else params.set('view', next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  /*
    `null` while there is no payload, so this memo can sit above the early returns — hooks
    after a conditional return is the one mistake in this file that would crash rather than
    merely read badly. The null is resolved by the `reportModel === null` guard below,
    which also narrows it for TypeScript.
  */
  const reportModel = useMemo(() => (data === null ? null : buildReportModel(data)), [data]);

  if (error && data === null) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
        <button
          onClick={retry}
          className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
        >
          Retry
        </button>
      </div>
    );
  }

  /*
    `reportModel` is null exactly when `data` is null, so checking both narrows both for
    TypeScript without an assertion.
  */
  if (data === null || reportModel === null) {
    return <AnalyticsSkeleton />;
  }

  const { hero, tiles, habits, range } = data;
  const heroPct = hero.total != null ? Math.min(Math.max(hero.total, 0), 100) : 0;
  const habitChart = habitChartCopy(period, range.label);
  const tierChart = tierChartCopy(period, range.label);

  const periodControl = (
    <PeriodControl
      period={period}
      onPeriodChange={setPeriod}
      label={range.label}
      onPrev={() => step(-1)}
      onNext={() => step(1)}
      onToday={reset}
      anchorDate={anchorDate}
      maxAnchor={userToday}
      timezone={timezone}
      panelId={PERIOD_PANEL_ID}
    />
  );

  /*
    The standard arrangement, built once and shared.

    Zen and Report are *views of this data*, not forks of it. Extracting it to a variable
    rather than a component means there is one `<HabitLab>`, one `<CompareStudio>` and one
    set of figures — so a report and the dashboard cannot show different numbers, which
    would be the most damaging possible bug on a page whose whole claim is honesty.
  */
  const standardBody = (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <PeriodBar
        period={period}
        onPeriodChange={setPeriod}
        label={range.label}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onToday={reset}
        anchorDate={anchorDate}
        maxAnchor={userToday}
        timezone={timezone}
        panelId={PERIOD_PANEL_ID}
        freshness={data.freshness}
        isLoading={isLoading}
        error={error}
        onRetry={retry}
      >
        <div className="flex flex-col gap-2 pt-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold">
              <span className="inline-flex rounded-2xl bg-primary/10 p-2 text-primary">
                <BarChart3 className="h-7 w-7" />
              </span>
              <span className="animated-gradient-text">Analytics</span>
            </h1>
            <p className="mt-2 text-muted-foreground">
              {period === 'day' ? 'Your day' : 'Your'} report for{' '}
              <span className="font-semibold text-foreground">{range.label}</span>
              {range.isCurrent ? ' (so far)' : ''}.
            </p>
          </div>
        </div>
      </PeriodBar>

      <div
        id={PERIOD_PANEL_ID}
        role="tabpanel"
        aria-labelledby={`${PERIOD_PANEL_ID}-tab-${period}`}
        tabIndex={-1}
        className={`transition-opacity duration-200 motion-reduce:transition-none ${
          isStale ? 'opacity-60' : 'opacity-100'
        }`}
        aria-busy={isLoading}
      >
        {/*
          What changed, above the fold and below the hero. Sits here rather than in the
          collapsed detail section because it is the answer to "how did this period go",
          not a domain breakdown — and because a page that makes the user expand
          something to find out what happened has already lost them.
        */}
        <HighlightChips insights={data.insights} />

        {/* ── Overview: the answer first ─────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="glass-panel glow-primary relative overflow-hidden rounded-2xl p-6 shadow-soft lg:col-span-2">
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
              aria-hidden="true"
            />

            <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
              <Target className="h-3.5 w-3.5" aria-hidden="true" />
              {range.label}
              {range.isCurrent ? ' so far' : ''}
            </p>

            <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
              {/*
                A ring that is empty when there is no score, rather than a ring at
                zero. The two are different facts: "you scored nothing" and "no score
                was recorded" are not the same sentence.
              */}
              <div className="relative h-32 w-32 shrink-0 rounded-full">
                {hero.total != null ? (
                  <div
                    className="conic-gradient-ring absolute inset-0 rounded-full"
                    style={{ '--p': `${heroPct}%` } as CSSProperties}
                    aria-hidden="true"
                  />
                ) : (
                  <div className="absolute inset-0 rounded-full border-4 border-dashed border-border" aria-hidden="true" />
                )}
                {/*
                  The ring itself is decoration; the number inside it is the fact.
                  Both the conic fill and the dashed empty state are hidden from
                  assistive tech, so without this the ring announced a bare "84" with
                  no unit, no scale and no period — the most important number on the
                  page, and the only one with no accessible name.
                */}
                <div
                  className="absolute inset-1.5 flex items-center justify-center rounded-full glass-panel shadow-soft"
                  role="img"
                  aria-label={
                    hero.total != null
                      ? `Period score ${Math.round(hero.total)} out of 100${
                          hero.grade != null
                            ? `, grade ${hero.grade}${
                                period === 'day' ? '' : `, averaged over ${hero.daysScored} scored days`
                              }`
                            : ''
                        }`
                      : 'No score recorded for this period'
                  }
                >
                  <span
                    className="text-3xl font-black tabular-nums text-foreground"
                    aria-hidden="true"
                  >
                    {hero.total != null ? Math.round(hero.total) : '—'}
                  </span>
                </div>
              </div>

              <div className="flex-1 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {hero.grade != null
                    ? `Grade ${hero.grade}${period === 'day' ? '' : ' (average)'}`
                    : 'No score recorded for this period'}
                  {/*
                    The count the average is over, when it is not all of them. A
                    week with three scored days used to claim seven, and a month
                    claimed one, so "average" was describing a period that did not
                    match the range on screen.
                  */}
                  {period !== 'day' && hero.daysScored > 0 ? (
                    <span className="tabular-nums">
                      {' '}
                      over {hero.daysScored} scored{' '}
                      {hero.daysScored === 1 ? 'day' : 'days'}
                    </span>
                  ) : null}
                </p>

                {/*
                  Every period has a comparison now, including the two longest —
                  a part-lived month is compared with the same number of days of the
                  month before, rather than with a whole one that would flatter it.

                  `basis` is not decoration. It is the sentence that makes the delta
                  above it mean anything, and it is generated from the same window the
                  arithmetic read, so it cannot describe a comparison that did not
                  happen. When there is no delta it carries the reason instead.
                */}
                {data.comparison.delta != null ? (
                  <div className="space-y-0.5">
                    <p className="flex items-center gap-1.5 text-sm">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <span className="tabular-nums text-foreground">
                        {deltaText(data.comparison.delta)}
                      </span>
                      <span className="text-muted-foreground">
                        vs {data.comparison.start} – {data.comparison.end}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">{data.comparison.basis}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{data.comparison.basis}</p>
                )}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: 'Core', value: hero.core, accent: 'text-sky-400' },
                    { label: 'Growth', value: hero.growth, accent: 'text-violet-400' },
                    { label: 'Bonus', value: hero.bonus, accent: 'text-amber-400' },
                    {
                      label: 'Habit reliability',
                      value: hero.habitReliability,
                      accent: 'text-emerald-400',
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl bg-card/70 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {item.label}
                      </p>
                      <p
                        className={`mt-1 text-2xl font-bold tabular-nums ${item.accent}`}
                        title={
                          item.value === null
                            ? 'No measurement for this period'
                            : undefined
                        }
                      >
                        {item.value != null ? Math.round(item.value) : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/*
                Every tile links to the page that owns its number. A figure with no
                route out of it is a dead end, and "where did 62% come from" is the
                first question anyone asks of a report.

                Each link carries the period's own date, so following one lands on the
                day or week being looked at rather than on today.
              */}
              <Tile
                label="Routine"
                value={tiles.routine != null ? `${Math.round(tiles.routine.completionRate)}%` : '—'}
                hint={
                  tiles.routine != null
                    ? `${tiles.routine.completed} of ${tiles.routine.total} blocks`
                    : 'Nothing tracked'
                }
                href={`/routine?date=${anchorDate}`}
              />
              <Tile
                label="Habits"
                value={percentText(habits.rate)}
                hint={
                  habits.scheduled > 0
                    ? `${habits.completed} of ${habits.scheduled} due`
                    : 'Nothing was due'
                }
                href="/habits"
              />
              <Tile
                label="Sleep"
                value={
                  tiles.sleepMinutes != null
                    ? `${Math.round(tiles.sleepMinutes / 60)}h${period === 'day' ? '' : ' avg'}`
                    : '—'
                }
                icon={<Moon className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />}
                hint={
                  data.sleep?.periodStats?.loggedDays != null
                    ? `${data.sleep.periodStats.loggedDays} nights logged`
                    : 'Not logged'
                }
                href="/wellness/sleep"
              />
              <Tile
                label="Mood"
                value={tiles.mood != null ? `${tiles.mood}/5` : '—'}
                hint={tiles.mood != null ? 'Average of logged days' : 'Not logged'}
                href="/wellness/mood"
              />
            </dl>
          </section>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 lg:grid-cols-1">
            <SideStat
              icon={<CalendarRange className="h-4 w-4" />}
              tag={range.label}
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
            {/*
              Streaks are all-time by nature. Labelling the tag "All time" is the
              whole fix: the previous version tagged the card with the selected
              period, implying a period-scoped streak that does not exist.
            */}
            <SideStat
              icon={<Flame className="h-4 w-4" />}
              tag="All time"
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

        {/* ── The two trends, side by side ───────────────────────────────── */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PeriodChart
            title={habitChart.title}
            description={habitChart.description}
            data={data.chart1}
            unit={period === 'day' ? 'score' : 'percent'}
            emptyMessage={
              period === 'day'
                ? 'No habits were scheduled on this day.'
                : 'No habits were due in this period.'
            }
            gradient={{ id: 'habitGradient', from: '#10b981', to: '#059669' }}
          />
          <PeriodChart
            title={tierChart.title}
            description={tierChart.description}
            data={data.chart2}
            unit={period === 'year' ? 'score' : 'percent'}
            emptyMessage={
              period === 'year' ? 'No days were scored in this year.' : 'Nothing was due in this period.'
            }
            gradient={{ id: 'tierGradient', from: '#8b5cf6', to: '#6d28d9' }}
          />
        </div>

        {/* ── Detail, on request ─────────────────────────────────────────── */}
        {/*
          Planned rest and reduced-load days. Text, not chart markers — neither chart
          plots a per-day series, so there is no bar these could annotate. See
          `DayContextNote` for why that is not a gap in the data.
        */}
        <DayContextNote annotations={data.annotations} periodLabel={range.label} />

        {/*
          Trend. Sits above the charts because it answers "which way" in one line, and a
          reader who wants the shape of it can stop there — the two charts below are the
          detailed version of the same question.
        */}
        <div className="mt-6">
          <TrendStrip
            payload={data}
            period={period}
            anchorDate={anchorDate}
            metric={effectiveTrendMetric}
            onMetricChange={setTrendMetric}
          />
        </div>

        {/*
          Compare, targets and export. Grouped above the charts because they are controls
          on the whole view rather than findings about it, and because Compare Studio's
          basis statement has to be read before its numbers.
        */}
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {compareAnchor === null ? (
              <button
                type="button"
                onClick={() => setCompareAnchor(previousComparableAnchor(anchorDate, data.today))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <GitCompareArrows className="h-3.5 w-3.5" aria-hidden="true" />
                Compare with the previous period
              </button>
            ) : (
              <CompareStudio
                primary={data}
                comparison={compare.data}
                period={period}
                isLoading={compare.isLoading}
                error={compare.error}
                isStale={compare.isStale}
                onRetry={compare.retry}
                onClose={() => setCompareAnchor(null)}
              />
            )}
          </div>

          <TargetsPanel payload={data} />

          <ViewsToolbar
            payload={data}
            hiddenRooms={hiddenRooms}
            onHiddenRoomsChange={setHiddenRooms}
            onOpenReview={() => setReviewOpen(true)}
          />
        </div>

        {/*
          Where the habit rate is won or lost. Sits directly under the charts because
          it is the answer to "what happened", while the rooms below are the answer to
          "tell me more".
        */}
        <div className="mt-6">
          <HabitLab panel={data.habits} periodLabel={range.label} />
        </div>

        {/* ── Detail, on request ─────────────────────────────────────────── */}
        <section className="mt-6 space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
            Every domain
            <span className="font-normal text-muted-foreground">
              — grouped, and each group says what it holds
            </span>
          </h2>

          {/*
            Four rooms rather than one flat list of twelve equal cards.

            Grouping is **display-only**: every dataset below was already fetched by the
            single dashboard request, and closing a room changes nothing the server
            computed. The panel that used to sit here said only "Show", which made a
            collapsed page unnavigable; each room now names its contents, so the reader
            can see that Wellbeing holds sleep before deciding to open it.

            Unmount-when-closed is a rendering decision, not a data one — see
            `DomainRoom`.
          */}
          <DomainRoom
            title="Routine & Habits"
            summary={`Streaks, tier mix and ${data.routine.blocks.length} routine ${
              data.routine.blocks.length === 1 ? 'block' : 'blocks'
            } tracked`}
            hidden={hiddenRooms.includes('routine-habits')}
          >
            <StreakPanel streaks={data.streaks} />
            <TierMixBar tierMix={data.tierMix} />
            <RoutineDetailCard routine={data.routine} />
          </DomainRoom>

          <DomainRoom
            title="Wellbeing"
            summary="Sleep, nutrition and health metrics, and the mood pulse"
            hidden={hiddenRooms.includes('wellbeing')}
          >
            <SleepSnapshotCard sleep={data.sleep} />
            <NutritionHealthCard nutrition={data.nutrition} health={data.health} />
          </DomainRoom>

          <DomainRoom
            title="Work"
            summary={`${data.focus.period.sessions} focus sessions, time allocation, ${data.tasks.open} open tasks and ${data.projects.length} projects`}
            hidden={hiddenRooms.includes('work')}
          >
            <FocusSummaryCard focus={data.focus} periodLabel={range.label} />
            <TimeAllocationCard allocation={data.timeAllocation} />
            <TaskQuadrantCard tasks={data.tasks} />
            <ProjectProgressList projects={data.projects} />
          </DomainRoom>

          <DomainRoom
            title="Growth"
            summary={`${data.milestones.length} milestones, ${data.journal.length} journal ${
              data.journal.length === 1 ? 'entry' : 'entries'
            }, ${data.achievements.length} achievements`}
            hidden={hiddenRooms.includes('growth')}
          >
            <MilestoneHitsCard milestones={data.milestones} title="Milestones" accent="emerald" />
            <JournalCard journal={data.journal} />
            <AchievementsStrip achievements={data.achievements} />
          </DomainRoom>
        </section>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <MoodPulseCard moodPulse={data.moodPulse} periodLabel={range.label} />
          {/*
            Rendered only when a real insight exists. The cron that generates them
            is still a stub, so the previous always-on empty state was a permanent
            "your insights will appear here" card promising content the app cannot
            produce — dead weight that read as a missing feature.
          */}
          {data.aiInsight && data.aiInsight.id !== dismissedInsightId ? (
            <AICalloutCard
              insight={data.aiInsight}
              onDismiss={(id) => setDismissedInsightId(id)}
            />
          ) : null}
        </div>
      </div>

      {/*
        Mounted last so it sits above everything and is reached last in the tab order,
        which is what a modal overlay should do. `ReviewMode` returns null when there is
        not enough data to fill a screen honestly, so the trigger is hidden too.
      */}
      {canReview(data) && (
        <ReviewMode payload={data} open={reviewOpen} onClose={() => setReviewOpen(false)} />
      )}
    </div>
  );

  if (view === 'report') {
    return <ReportView model={reportModel} onExit={() => setView('standard')} />;
  }

  if (view === 'zen') {
    return (
      <ZenView
        model={reportModel}
        periodControl={periodControl}
        onExit={() => setView('standard')}
      />
    );
  }

  return (
    <>
      {standardBody}
      {/*
        The view switcher sits outside the standard body so it is reachable from every
        arrangement — a mode you cannot leave because the control to leave was inside the
        mode is a trap.
      */}
      <ViewSwitcher view={view} onChange={setView} />
    </>
  );
}

/**
 * Standard / Zen / Report.
 *
 * Rendered for Zen and Report as well, not just standard, because the way out of a mode
 * has to be visible from inside it. In Report it is hidden at print time along with
 * everything else that cannot exist on paper.
 */
function ViewSwitcher({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
  const options: Array<{ id: ViewMode; label: string }> = [
    { id: 'standard', label: 'Standard' },
    { id: 'zen', label: 'Zen' },
    { id: 'report', label: 'Report' },
  ];

  return (
    <div
      data-print-hide
      className="fixed bottom-4 right-4 z-40 flex items-center gap-0.5 rounded-xl border border-border/60 bg-card/90 p-1 shadow-soft backdrop-blur-md"
    >
      <div role="group" aria-label="View" className="flex">
        {options.map((option) => {
          const active = option.id === view;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.id)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                active
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One summary figure.
 *
 * Renders as a link when it has a destination. `<dl>` requires each term to be
 * wrapped in a `<div>` when the description is a link rather than plain text — putting
 * `<a>` directly inside `<dd>` breaks the description-list structure — so the `<div>`
 * wrapper is load-bearing rather than a layout convenience.
 *
 * The anchor keeps the real destination in the accessibility tree with its own
 * accessible name, so a screen reader announces "Routine, 62%, 5 of 8 blocks, link"
 * rather than three disconnected fragments.
 */
/**
 * The anchor to compare against when the user turns Compare on.
 *
 * The previous *day*, seven days back for a week, and so on — the same step the
 * `PeriodControl` arrows use, so "compare with the previous period" means what the arrows
 * mean. Returns `null` when there is no earlier day to compare with, which is the case for
 * a brand-new account; the hook then issues nothing rather than fetching a date the server
 * would accept but that describes nothing.
 */
function previousComparableAnchor(anchorDate: string, today: string): string | null {
  const previous = shiftCalendarDay(anchorDate, -1);
  return previous > today ? null : previous;
}

function Tile({
  label,
  value,
  hint,
  icon,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  icon?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold tabular-nums text-foreground">
        <span className="flex items-center gap-1">
          {icon}
          {value}
        </span>
      </dd>
      <dd className="mt-0.5 text-[11px] text-muted-foreground">{hint}</dd>
    </>
  );

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3 transition-colors hover:border-primary/40 hover:bg-card/80 motion-reduce:transition-none">
      {href ? (
        <Link
          href={href}
          className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {body}
          <span className="sr-only"> — open {label}</span>
        </Link>
      ) : (
        body
      )}
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
