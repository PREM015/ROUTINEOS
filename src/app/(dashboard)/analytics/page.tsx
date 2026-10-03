'use client';

import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarRange,
  Flame,
  Loader2,
  Moon,
  Target,
  TrendingUp,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { usePeriodUrlState } from '@/hooks/usePeriodUrlState';
import { PeriodControl } from '@/components/shared/PeriodControl';
import type { AnalyticsDashboard } from '@/types/analytics';
import type { Period } from '@/lib/period-range';
import { Spinner } from '@/components/ui';
import { deltaText, percentText } from '@/lib/analytics/format';
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
    });

  const [dismissedInsightId, setDismissedInsightId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  /*
    Hard failure with nothing to show: the retry is the only useful thing on the
    page, so it takes the whole screen rather than being buried under an empty
    dashboard whose zeros look like data.
  */
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

  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const { hero, tiles, habits, range } = data;
  const heroPct = hero.total != null ? Math.min(Math.max(hero.total, 0), 100) : 0;
  const habitChart = habitChartCopy(period, range.label);
  const tierChart = tierChartCopy(period, range.label);

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
            {period === 'day' ? 'Your day' : 'Your'} report for{' '}
            <span className="font-semibold text-foreground">{range.label}</span>
            {range.isCurrent ? ' (so far)' : ''}.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
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
          {/*
            The strip is a real tablist, so it has to name the panel it drives —
            and that panel is this whole reporting surface, which lives in the
            caller. See `PeriodControl.panelId`.
          */}
          <FreshnessChip freshness={data.freshness} />
          {/*
            Status region rather than a full-screen spinner. The previous numbers
            stay readable underneath, but the page never claims they are current
            while they are not — which is how a user ends up reading last week's
            average as today's.
          */}
          <p
            role="status"
            aria-live="polite"
            className="flex min-h-4 items-center gap-1.5 text-xs text-muted-foreground"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                Updating…
              </>
            ) : error ? (
              <span className="text-destructive">{error} — showing the last loaded period.</span>
            ) : isStale ? (
              'Updating…'
            ) : null}
          </p>
        </div>
      </div>

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
                  Only compare like with like. A part-lived week against a whole one
                  is not a comparison, so the service sends `null` and nothing is
                  claimed — rather than a flattering delta.
                */}
                {data.comparison?.delta != null ? (
                  <p className="flex items-center gap-1.5 text-sm">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="tabular-nums text-foreground">
                      {deltaText(data.comparison.delta)}
                    </span>
                    <span className="text-muted-foreground">
                      vs {data.comparison.start} – {data.comparison.end}
                    </span>
                  </p>
                ) : data.comparison ? (
                  <p className="text-sm text-muted-foreground">
                    No score recorded in {data.comparison.start} – {data.comparison.end} to
                    compare against.
                  </p>
                ) : null}

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
              <Tile
                label="Routine"
                value={tiles.routine != null ? `${Math.round(tiles.routine.completionRate)}%` : '—'}
                hint={
                  tiles.routine != null
                    ? `${tiles.routine.completed} of ${tiles.routine.total} blocks`
                    : 'Nothing tracked'
                }
              />
              <Tile
                label="Habits"
                value={percentText(habits.rate)}
                hint={
                  habits.scheduled > 0
                    ? `${habits.completed} of ${habits.scheduled} due`
                    : 'Nothing was due'
                }
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
              />
              <Tile
                label="Mood"
                value={tiles.mood != null ? `${tiles.mood}/5` : '—'}
                hint={tiles.mood != null ? 'Average of logged days' : 'Not logged'}
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
        <section className="mt-6">
          <button
            type="button"
            onClick={() => setDetailOpen((open) => !open)}
            aria-expanded={detailOpen}
            className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-card/50 px-5 py-4 text-left transition-colors hover:bg-card/70"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
              Explore every domain
              <span className="font-normal text-muted-foreground">
                — habits, routine, wellbeing, focus, goals
              </span>
            </span>
            <span className="text-sm font-medium text-primary">
              {detailOpen ? 'Hide' : 'Show'}
            </span>
          </button>

          {detailOpen && (
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              <StreakPanel streaks={data.streaks} />
              <TierMixBar tierMix={data.tierMix} />
              <FocusSummaryCard focus={data.focus} periodLabel={range.label} />
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
          )}
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
    </div>
  );
}

/**
 * Says so when the scores behind this period are incomplete.
 *
 * Scores are computed by a bounded nightly job, so a period can hold days nobody
 * has got to. The alternative was a page that quietly averaged whatever existed
 * and called it the period — which reads as a decline when the truth is that four
 * days are missing. A chip that appears only when something is missing keeps the
 * common case quiet.
 *
 * `title` carries the explanation for anyone who cannot see the chip's short
 * text, and `aria-live` is deliberately absent: it does not change on its own, and
 * a live region that fires on every period change is noise.
 */
function FreshnessChip({ freshness }: { freshness: AnalyticsDashboard['freshness'] }) {
  if (freshness.unscoredDays === 0) return null;

  const explanation =
    `Scores are computed by a nightly job. ${freshness.unscoredDays} of the ` +
    `${freshness.elapsedDays} elapsed ${freshness.elapsedDays === 1 ? 'day has' : 'days have'} ` +
    'no score yet, so the average above covers fewer days than the period.' +
    (freshness.latestScoredDate ? ` Newest score: ${freshness.latestScoredDate}.` : '') +
    ' Days still unscored can be computed on demand from Today.';

  return (
    <p
      title={explanation}
      className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>
        {freshness.unscoredDays} of {freshness.elapsedDays} elapsed{' '}
        {freshness.elapsedDays === 1 ? 'day' : 'days'} not scored yet
      </span>
      <span className="sr-only">. {explanation}</span>
    </p>
  );
}

function Tile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold tabular-nums text-foreground">
        <span className="flex items-center gap-1">
          {icon}
          {value}
        </span>
      </dd>
      <dd className="mt-0.5 text-[11px] text-muted-foreground">{hint}</dd>
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