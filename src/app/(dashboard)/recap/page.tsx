'use client';

import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { CalendarDays, RotateCw, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { usePeriodUrlState } from '@/hooks/usePeriodUrlState';
import { apiRequest } from '@/lib/api-client';
import type { Period } from '@/lib/period-range';
import { orNull, percentText } from '@/lib/analytics/format';
import { THRESHOLDS } from '@/config/scoring';
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
import type { RecapReport, RecapExtras } from '@/types/recap';

/**
 * Recap page — real data only.
 *
 * ## State lives in the URL
 *
 * Period and anchor are held by `usePeriodUrlState`, the same hook `/analytics`
 * uses. The page previously kept both in `useState` behind a hand-rolled
 * `requestId` race guard, which meant a recap view could not be linked,
 * bookmarked or reached with the back button, a failed load had no retry, and
 * `shiftAnchor` was called without the timezone while the very same component
 * passed that timezone to `PeriodControl` four lines later. One hook closes all
 * of those because its `step()` resolves through `getPeriodRange(...).prev/next`,
 * where the zone is a required argument.
 *
 * ## The report is the result, not a transient UI state
 *
 * While a new period loads the previous one stays on screen, dimmed and marked
 * `aria-busy`, rather than being replaced by a skeleton. Blanking the page on
 * every arrow click destroys the sense of a continuous surface, and showing the
 * old numbers with no signal is how a user reads last week's average as this
 * week's.
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
 * A module constant so it is identical on both sides of the relationship — the
 * strip renders before the panel exists in the tree, and a `useId()` would have to
 * be threaded through the component boundary between them.
 */
const RECAP_PANEL_ID = 'recap-period-panel';

function monthName(monthKey: string): string {
  return format(parseISO(`${monthKey}-15`), 'MMM');
}

const PERIOD_NOUN: Record<Period, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
};

/** Read from config so the milestone label cannot disagree with the scorer. */
const PERFECT_DAY_THRESHOLD = THRESHOLDS.achievements.perfectDay;

/**
 * How much of the visible period has actually happened.
 *
 * Counted from the days the habit model considered, not from the calendar, so
 * the number matches the denominator the rates were actually computed against.
 * A day period is "so far" trivially and saying so would be noise.
 */
function liveSuffix(report: RecapReport): string | null {
  if (report.period === 'day') return null;
  const { totalDays } = report.habitCoverage;
  if (totalDays <= 0) return null;
  const noun = report.period === 'week' ? 'day' : report.period === 'month' ? 'day' : 'month';
  return `${totalDays} ${noun}${totalDays === 1 ? '' : 's'} so far`;
}

export default function RecapPage() {
  const { today, timezone } = useUserTimezone();

  const load = useCallback(
    (period: Period, anchor: string) =>
      apiRequest<RecapReport>('/api/recap', { query: { period, date: anchor } }),
    []
  );

  const { period, anchorDate, data, error, isLoading, isStale, setPeriod, step, reset, retry } =
    usePeriodUrlState<RecapReport>(load, {
      period: 'week',
      today,
      timezone,
      /*
        A reader, not a value: the hook owns `data`, so passing
        `data?.weekStartsOn` would refer to `data` inside the initialiser that
        produces it — a self-reference that is in its temporal dead zone on first
        render. Until the first response lands the hook uses Monday, which is
        correct for the majority and is replaced by the server's own value the
        moment it exists.
      */
      readWeekStartsOn: (report) => report.weekStartsOn,
    });

  const hasData = data?.hasData ?? false;
  /*
    No data *and* no error means the first request has not resolved yet — not that
    something went wrong.

    `usePeriodUrlState` starts `isLoading` at `false` and only raises it inside its
    effect, so keying the skeleton off `isLoading` alone meant the very first
    client render fell through to the error branch and flashed "Couldn't load your
    recap" with a Try again button on every cold load, before the fetch that was
    always going to succeed had a chance to finish. The prerendered HTML caught it:
    `/recap` is a static route, so this branch is what Next renders at build time.
  */
  const showSkeleton = data === null && error === null;
  const suffix = data?.isCurrent ? liveSuffix(data) : null;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recap</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review how your habits, routine, sleep and scores evolved.
            {/*
              A live period is not a shorter version of a complete one — it is a
              different measurement. "This week" on a Thursday has three days of
              history and seven days of window, so without this the week reads as
              a bad week rather than an unfinished one. The habit model clips the
              denominator to today, so the rate is already fair; this says so.
            */}
            {suffix && <span className="ml-1.5">({suffix})</span>}
          </p>
        </div>

        <PeriodControl
          period={period}
          onPeriodChange={setPeriod}
          label={data?.label ?? '—'}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onToday={reset}
          anchorDate={anchorDate}
          maxAnchor={today}
          timezone={timezone}
          panelId={RECAP_PANEL_ID}
        />
      </div>

      {/*
        The strip above is a tablist, so it has to name the panel it drives. The
        states below are all that panel: loading, failure and content are three
        renderings of one region, so the role sits on the wrapper rather than
        being repeated per branch.
      */}
      <div
        id={RECAP_PANEL_ID}
        role="tabpanel"
        aria-labelledby={`${RECAP_PANEL_ID}-tab-${period}`}
        aria-busy={isLoading}
        tabIndex={-1}
        className={cn(
          'transition-opacity duration-200 motion-reduce:transition-none',
          isStale ? 'opacity-60' : 'opacity-100'
        )}
      >
        {showSkeleton ? (
          <RecapSkeleton />
        ) : data === null ? (
          /* Reached only with an error: the skeleton owns every error-free wait. */
          <ErrorState message={error ?? 'No recap loaded.'} onRetry={retry} />
        ) : !hasData ? (
          <NoDataState period={period} anchorDate={data.anchorDate} />
        ) : (
          <>
            {/*
              An error arriving *over* live data. The period content stays — the
              previous period is still the last thing the server confirmed — and
              the failure is reported above it rather than replacing it.
            */}
            {error !== null && (
              <p
                role="status"
                className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400"
              >
                <span>{error}</span>
                <button
                  type="button"
                  onClick={retry}
                  className="inline-flex items-center gap-1 rounded-md font-medium underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Retry
                </button>
              </p>
            )}
            <RecapDashboard period={period} report={data} />
          </>
        )}
      </div>
    </div>
  );
}

function RecapDashboard({ period, report }: { period: Period; report: RecapReport }) {
  const extras = report.extras;

  if (period === 'day' && report.day) {
    return (
      <div className="space-y-6">
        <DailyRecap day={report.day} />
        <Highlights period={period} report={report} />
        {extras && (
          <ExtrasGrid extras={extras} report={report} period={period} />
        )}
        <ShareRecapCard
          periodLabel="Today"
          periodNoun={PERIOD_NOUN[period]}
          stats={dayShareStats(report.day)}
        />
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
          valueLabel="Score"
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
        {extras && (
          <ExtrasGrid extras={extras} report={report} period={period} />
        )}
        <Highlights period={period} report={report} />
        <ShareRecapCard
          periodLabel={report.label}
          periodNoun={PERIOD_NOUN[period]}
          stats={weekShareStats(report.week)}
        />
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
          valueLabel="Score"
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
        {extras && (
          <ExtrasGrid extras={extras} report={report} period={period} />
        )}
        <Highlights period={period} report={report} />
        <ShareRecapCard
          periodLabel={report.label}
          periodNoun={PERIOD_NOUN[period]}
          stats={monthShareStats(report.month)}
        />
      </div>
    );
  }

  if (period === 'year' && report.year) {
    // Months with no scored day are dropped rather than shown as 0, so a year the
    // user has not finished does not read as a year of zeroes.
    const yearRows =
      report.year.monthlyScoreTrend
        ?.filter((entry) => entry.averageScore !== null)
        .map((entry) => ({
          label: monthName(entry.month),
          value: entry.averageScore ?? 0,
        })) ?? [];
    return (
      <div className="space-y-6">
        <YearlyRecap year={report.year} />
        <TrendCard
          title="Monthly average scores"
          rows={yearRows}
          accent="#6366f1"
          valueLabel="Average score"
          headline={
            orNull(report.year.averageScore) !== null
              ? `${Math.round(report.year.averageScore ?? 0)}`
              : '—'
          }
          className="w-full"
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {report.year.bestMonth && (
            <BestDayCard
              kind="month"
              date={monthName(report.year.bestMonth.month)}
              score={Math.round(report.year.bestMonth.averageScore)}
              subtitle={`${report.year.totalDaysScored} days scored all year`}
            />
          )}
          <MilestoneCard milestones={yearMilestones(report.year)} />
        </div>
        {extras && (
          <ExtrasGrid extras={extras} report={report} period={period} />
        )}
        <Highlights period={period} report={report} />
        <ShareRecapCard
          periodLabel={report.label}
          periodNoun={PERIOD_NOUN[period]}
          stats={yearShareStats(report.year)}
        />
      </div>
    );
  }

  /*
    The report named a period this renderer has no branch for.

    This used to `return null`, which produced a blank page below a fully
    rendered header and no console output — the worst possible failure mode,
    because it looks like a bug in the user's browser. The service cannot
    currently produce such a report, so this is defence rather than a live path;
    it costs three lines to say so.
  */
  return (
    <EmptyPanel
      title="This recap could not be displayed"
      body={`The server returned a report for "${report.period}" that this page does not know how to render. Nothing is lost — reload to try again.`}
    />
  );
}

/**
 * Extras grid — the per-period enrichment cards.
 *
 * ## Only the cards with something in them
 *
 * Twelve of the thirteen cards rendered unconditionally, on every period. On the
 * day view that meant a single `DailyRecap` followed by a dozen paragraphs
 * explaining that nothing happened, and on the week view thirteen cards below
 * the fold. Each card already owns a correct empty state; the problem was that
 * the empty state was the *only* thing a user saw for most of them.
 *
 * Cards are therefore grouped: anything with data is shown, anything empty
 * collapses into one disclosure that says how many are hidden. Nothing is
 * deleted — the data is still in the response, and expanding still shows it.
 */
function ExtrasGrid({
  extras,
  report,
  period,
}: {
  extras: RecapExtras;
  report: RecapReport;
  period: Period;
}) {
  const cards = useMemo(() => {
    const built: Array<{ key: string; hasContent: boolean; node: ReactNode }> = [
      {
        key: 'habits',
        hasContent: extras.habitHeatmap.some((day) => day.scheduled > 0),
        node: (
          <HabitHeatmapCard
            habitHeatmap={extras.habitHeatmap}
            dueDays={report.habitCoverage.dueDays}
            totalDays={report.habitCoverage.totalDays}
            periodNoun={PERIOD_NOUN[period]}
          />
        ),
      },
      {
        key: 'sleep',
        hasContent: extras.sleepTrend.length > 0,
        node: <SleepTrendCard sleepTrend={extras.sleepTrend} />,
      },
      {
        key: 'mood',
        hasContent: extras.moodEnergy.length > 0,
        node: <MoodEnergyCard moodEnergy={extras.moodEnergy} />,
      },
      {
        key: 'focus',
        hasContent: extras.focusByCategory.length > 0,
        node: <FocusBreakdownCard focusByCategory={extras.focusByCategory} />,
      },
      {
        key: 'goals',
        // `activeCount` is a live count against the whole account, not activity
        // inside the window, so it deliberately does not promote the card.
        hasContent:
          extras.goalsDelta.completedInPeriod > 0 || extras.goalsDelta.averageProgress > 0,
        node: <GoalsProgressCard goalsDelta={extras.goalsDelta} />,
      },
      {
        key: 'tasks',
        hasContent: extras.taskThroughput.created > 0 || extras.taskThroughput.completed > 0,
        node: <TaskThroughputCard taskThroughput={extras.taskThroughput} />,
      },
      {
        key: 'nutrition',
        hasContent: extras.nutrition !== null || (extras.health?.length ?? 0) > 0,
        node: <NutritionHealthCard nutrition={extras.nutrition} health={extras.health} />,
      },
      {
        key: 'streaks',
        hasContent: extras.streakEvents.length > 0 || extras.achievements.length > 0,
        node: (
          <StreakMilestonesCard
            streakEvents={extras.streakEvents}
            achievements={extras.achievements}
          />
        ),
      },
      {
        key: 'journal',
        hasContent: extras.journal.length > 0,
        node: <JournalCard journal={extras.journal} />,
      },
      {
        key: 'exceptions',
        hasContent: extras.routineExceptions.length > 0,
        node: <RoutineExceptionsCard exceptions={extras.routineExceptions} />,
      },
      {
        key: 'milestones',
        hasContent: extras.milestoneHits.length > 0,
        node: <MilestoneHitsCard milestones={extras.milestoneHits} />,
      },
      {
        key: 'reflections',
        hasContent: extras.reflections.length > 0,
        node: <ReflectionNarrativesCard reflections={extras.reflections} />,
      },
    ];

    if (extras.linkedReview) {
      built.push({
        key: 'review',
        hasContent: true,
        node: <LinkedReviewCard linkedReview={extras.linkedReview} />,
      });
    }

    return built;
  }, [extras, period, report.habitCoverage.dueDays, report.habitCoverage.totalDays]);

  const populated = cards.filter((card) => card.hasContent);
  const empty = cards.filter((card) => !card.hasContent);

  if (populated.length === 0) {
    return (
      <details className="glass-panel rounded-2xl p-6">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Nothing recorded in the other {cards.length} areas
        </summary>
        <div className="mt-4 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {empty.map((card) => (
            <div key={card.key}>{card.node}</div>
          ))}
        </div>
      </details>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {populated.map((card) => (
          <div key={card.key}>{card.node}</div>
        ))}
      </div>

      {empty.length > 0 && (
        <details className="glass-panel rounded-2xl p-6">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            Show {empty.length} more area{empty.length === 1 ? '' : 's'} with nothing recorded
          </summary>
          <div className="mt-4 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {empty.map((card) => (
              <div key={card.key}>{card.node}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function dayShareStats(day: NonNullable<RecapReport['day']>): ShareStat[] {
  return [
    { label: 'Score', value: day.score.total != null ? String(Math.round(day.score.total)) : '—' },
    // `habitReliability` is `null` when nothing was due. It used to be printed
    // unguarded, so a day with no habits due rendered `0%` while its three
    // sibling cells correctly rendered an em dash — the one number on the card
    // claiming a measurement that was never taken.
    { label: 'Habit reliability', value: percentText(day.habitReliability) },
    {
      label: 'Routine',
      value: day.routine.total > 0 ? `${Math.round(day.routine.completionRate)}%` : '—',
    },
    {
      label: 'Sleep',
      value: day.sleep.durationMinutes != null ? formatDuration(day.sleep.durationMinutes) : '—',
    },
  ];
}

function weekShareStats(week: NonNullable<RecapReport['week']>): ShareStat[] {
  return [
    { label: 'Average score', value: String(Math.round(week.scores.average)) },
    { label: 'Habit completion', value: percentText(week.habits.averageCompletionRate) },
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
    { label: 'Average score', value: orNull(year.averageScore) !== null ? String(Math.round(year.averageScore as number)) : '—' },
    { label: 'Days scored', value: String(year.totalDaysScored) },
    { label: 'Habits completed', value: String(year.habits.totalCompleted) },
    { label: 'Longest streak', value: `${year.streaks.longest} days` },
  ];
}

/* ── Real milestones per period ────────────────────────────────────────────── */

/**
 * "Perfect day" is `>= 95`, everywhere else in the app.
 *
 * The label used to read "N days at 100 points" while the threshold in all three
 * analytics modules is `THRESHOLDS.achievements.perfectDay` — 95. So a user with a
 * 96-point day was told they had not quite hit 100. The number is read from
 * `config/scoring` rather than restated, so it cannot drift again.
 */
function perfectDaysLabel(count: number): string {
  return `${count} day${count === 1 ? '' : 's'} at ${PERFECT_DAY_THRESHOLD}+ points`;
}

function weekMilestones(week: NonNullable<RecapReport['week']>): Milestone[] {
  const milestones: Milestone[] = [];
  if (week.scores.perfectDays > 0) {
    milestones.push({
      label: 'Perfect days',
      value: perfectDaysLabel(week.scores.perfectDays),
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
      value: `${week.habits.mostCompleted.habitName} (${percentText(week.habits.mostCompleted.completionRate)})`,
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
      value: perfectDaysLabel(month.scores.perfectDays),
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

/**
 * One skeleton, shaped like the real grid.
 *
 * There were two: `loading.tsx` (4 tiles in a 2-column grid plus a bar) for the
 * RSC phase and `SkeletonGrid` (4 tiles in a 4-column grid plus one `h-72`) for
 * the fetch. Neither matched the layout that actually renders, so the page
 * visibly reshuffled as it loaded. This one is 4 tiles, a hero block and a
 * 3-column card grid — the order the content appears in.
 *
 * `aria-hidden` because the panel already carries `aria-busy`; telling a screen
 * reader "loading" twice tells it nothing twice.
 */
function RecapSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse space-y-6 motion-reduce:animate-none">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-muted" />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-56 rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

function EmptyPanel({
  icon,
  title,
  body,
  children,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="glass-panel shadow-soft rounded-2xl p-10 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <h2 className="mt-4 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {children && <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}

/**
 * A failure the user can act on.
 *
 * The body is the message the server sent rather than a fixed "Couldn't load
 * your recap" — a 401, a 429 and a dropped connection are different problems and
 * the old copy explained none of them. The retry re-issues the same request
 * without changing the period, which is what "try again" means to someone who
 * did nothing wrong.
 */
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyPanel
      icon={<TrendingUp className="mx-auto h-10 w-10 opacity-50" aria-hidden="true" />}
      title="Couldn't load your recap"
      body={message}
    >
      <button
        type="button"
        onClick={onRetry}
        className="light-sweep glow-neon inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <RotateCw className="h-4 w-4" aria-hidden="true" />
        Try again
      </button>
      <Link
        href="/today"
        className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Go to Today
      </Link>
    </EmptyPanel>
  );
}

/**
 * A period that genuinely has nothing in it.
 *
 * The copy previously named only three of the things that satisfy the activity
 * probe — habits, routine, sleep — so a user who had written a journal entry or
 * logged a mood reading was told to go and do three unrelated things instead. It
 * now names the full set, and links to the two pages where those things are
 * recorded rather than leaving the user to find them.
 */
function NoDataState({ period, anchorDate }: { period: Period; anchorDate: string }) {
  const when =
    period === 'day'
      ? `Nothing was recorded on ${format(parseISO(anchorDate), 'EEEE, d MMMM')}.`
      : `Nothing was recorded in this ${period}.`;

  return (
    <EmptyPanel
      icon={<CalendarDays className="mx-auto h-10 w-10 opacity-50" aria-hidden="true" />}
      title="No recap data for this period"
      body={`${when} A recap builds itself from what you log — tick a habit, complete a routine block, log sleep, write a reflection or a journal entry, or run a focus session.`}
    >
      <Link
        href="/today"
        className="light-sweep glow-neon inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Go to Today
      </Link>
      <Link
        href="/journal"
        className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Open your journal
      </Link>
    </EmptyPanel>
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
    // `null` is not sortable against a number, so habits that were never due are
    // excluded here rather than being pushed to the bottom as if they scored 0.
    const reliable = month.habits.perHabit
      .filter((habit) => habit.weeklyRates.some((rate) => rate !== null))
      .sort((a, b) => (b.completionRate ?? -1) - (a.completionRate ?? -1))[0];
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
                ? `Most reliable: ${reliable.habitName} (${percentText(reliable.completionRate)})`
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