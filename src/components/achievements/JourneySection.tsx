'use client';

/**
 * JourneySection — XP progression, unlock cadence, and month-on-month.
 *
 * ## Every number arrives pre-computed
 *
 * The curve, its level bands, the milestone markers, the calendar buckets and the
 * month comparison all come from `derived.ts`. This component computes nothing: no
 * XP sum, no level arithmetic, no date bucketing, no counting. That is the rule the
 * brief sets, and it is why the section cannot show a level the hero does not show.
 *
 * ## Honesty rules this renders
 *
 * - **A level band is drawn only for a level the data reaches.** `journeyThresholds`
 *   stops at the final cumulative XP, so the chart never shows a band above where
 *   the user actually is.
 * - **Level 1 has no band.** Its threshold is 0 XP, which is the chart's origin, not
 *   a transition; drawing a line there would imply "reached level 1" as an event.
 * - **An empty day is not a missed day.** The calendar's three buckets are
 *   none / light / strong, and `none` means "no unlocks recorded", not a failure.
 * - **A comparison that cannot be supported is suppressed, not approximated.**
 *   `monthOnMonthModel` returns an explicit `insufficient` variant, and this renders
 *   that variant's own copy rather than a zero-versus-zero comparison.
 *
 * ## Text alternative
 *
 * Every chart here has a visually-hidden table carrying the same figures, and the
 * curve itself is an SVG with a text summary. A canvas or a bare SVG is invisible to
 * a screen reader, and "unlock cadence" as a coloured grid is meaningless without it.
 */

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ACHIEVEMENT_RARITIES } from '@/lib/constants/achievements';
import {
  CADENCE_STRONG_THRESHOLD,
  MIN_JOURNEY_UNLOCKS,
  cadenceByDay,
  cadenceMonth,
  journeySeries,
  journeyThresholds,
  monthOnMonthModel,
  shiftMonth,
  type JourneyPoint,
  type LevelCrossing,
  type MonthOnMonthModel,
} from '@/lib/achievements/derived';
import type { AchievementTile } from '@/lib/achievements/view-model';
import { useAnimationsEnabled } from '@/hooks/useAnimationsEnabled';
import { accentFill, cn } from '@/lib/utils';

const CHART_HEIGHT = 140;
const CHART_WIDTH = 600;
/** Room for the level labels so they never clip at the right edge. */
const CHART_PAD_RIGHT = 44;

export interface JourneySectionProps {
  earned: readonly AchievementTile[];
  timezone: string;
  today: string;
}

export function JourneySection({ earned, timezone, today }: JourneySectionProps) {
  const { points, crossings, thresholds, finalXp } = useMemo(() => {
    const series = journeySeries(earned);
    const last = series.points[series.points.length - 1];
    return {
      points: series.points,
      crossings: series.crossings,
      finalXp: last?.cumulativeXp ?? 0,
      thresholds: journeyThresholds(last?.cumulativeXp ?? 0),
    };
  }, [earned]);

  const cadence = useMemo(() => cadenceByDay(earned, timezone), [earned, timezone]);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const calendar = useMemo(() => cadenceMonth(cadence, month), [cadence, month]);
  const trend = useMemo(
    () => monthOnMonthModel(earned, timezone, today),
    [earned, timezone, today]
  );

  // Below three unlocks a cumulative curve is a straight line with two dots on it.
  const showCurve = points.length >= MIN_JOURNEY_UNLOCKS;
  const currentDayKey = today;

  return (
    <div className="space-y-7">
      {/* XP journey */}
      <section aria-labelledby="journey-heading">
        <SectionHeading
          id="journey-heading"
          title="XP journey"
          caption={
            showCurve
              ? `${points.length} unlock${points.length === 1 ? '' : 's'} · ${finalXp.toLocaleString()} XP total`
              : 'Appears from your third unlock'
          }
        />
        {showCurve ? (
          <>
            <XpCurve points={points} thresholds={thresholds} finalXp={finalXp} />
            <MilestoneList crossings={crossings} />
            {/* The table is the chart's accessible twin: hidden visually, present for
                assistive technology, carrying the same figures as the SVG. `sr-only`
                sits on a wrapper rather than the table, because table layout ignores
                the 1px width and grows to max-content, which pushed the document
                scroll width past the viewport on a 320px screen. */}
            <div className="sr-only">
              <table>
                <caption>XP earned by unlock</caption>
                <thead>
                  <tr>
                    <th scope="col">Badge</th>
                    <th scope="col">Unlocked</th>
                    <th scope="col">XP</th>
                    <th scope="col">Total XP</th>
                    <th scope="col">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point) => (
                    <tr key={point.id}>
                      <th scope="row">{point.name}</th>
                      <td>{new Date(point.unlockedAt).toLocaleDateString()}</td>
                      <td>{point.xp}</td>
                      <td>{point.cumulativeXp}</td>
                      <td>{point.level}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="ach-panel rounded-2xl px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">
              {earned.length === 0
                ? 'Your XP journey starts with your first badge'
                : `${earned.length} unlock${earned.length === 1 ? '' : 's'} so far`}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              {earned.length === 0
                ? 'Every badge adds XP, and XP raises your trophy level. The curve appears once there is a shape to draw.'
                : 'The chart appears from your third unlock, once a few points make a progression rather than a line.'}
            </p>
          </div>
        )}
      </section>

      {/* Cadence */}
      <section aria-labelledby="cadence-heading">
        <SectionHeading
          id="cadence-heading"
          title="Unlock cadence"
          caption={
            calendar.total === 0
              ? 'Nothing recorded this month'
              : `${calendar.total} unlock${calendar.total === 1 ? '' : 's'} across ${calendar.activeDays} day${calendar.activeDays === 1 ? '' : 's'}`
          }
          action={
            <MonthStepper
              month={month}
              onChange={setMonth}
              // Future months have no data by definition; there is nothing to page
              // forward into.
              canGoForward={month < today.slice(0, 7)}
            />
          }
        />
        <CadenceGrid calendar={calendar} month={month} today={currentDayKey} />
      </section>

      {/* Month on month */}
      <section aria-labelledby="trend-heading">
        <SectionHeading id="trend-heading" title="Month on month" />
        <TrendCard model={trend} />
      </section>
    </div>
  );
}

function SectionHeading({
  id,
  title,
  caption,
  action,
}: {
  id: string;
  title: string;
  caption?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h3
          id={id}
          className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
        >
          {title}
        </h3>
        {caption && (
          <p className="mt-0.5 text-sm font-medium text-foreground">{caption}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/**
 * The cumulative curve.
 *
 * Drawn from the derived points only. X is index, not time: unlock dates cluster
 * unevenly (three badges on one day, then a month of nothing), and a time axis
 * would render that as a long flat line with a vertical jump, which reads as "no
 * progress" for a month that was simply quiet.
 *
 * The area fill exists so the shape carries weight. A bare 2px line on a grid reads
 * as decoration; a filled region reads as an accumulating quantity, which is what it
 * is.
 */
function XpCurve({
  points,
  thresholds,
  finalXp,
}: {
  points: JourneyPoint[];
  thresholds: { level: number; at: number }[];
  finalXp: number;
}) {
  const animationsEnabled = useAnimationsEnabled();
  const plotWidth = CHART_WIDTH - CHART_PAD_RIGHT;
  const maxXp = Math.max(1, finalXp);
  const usableHeight = CHART_HEIGHT - 20;
  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const x = (index: number) => (points.length > 1 ? index * stepX : plotWidth / 2);
  const y = (xp: number) => CHART_HEIGHT - (xp / maxXp) * usableHeight - 6;

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point.cumulativeXp)}`)
    .join(' ');
  const area =
    points.length > 0
      ? `${line} L${x(points.length - 1)},${CHART_HEIGHT} L${x(0)},${CHART_HEIGHT} Z`
      : '';
  const last = points[points.length - 1];

  return (
    <div className="ach-panel overflow-hidden rounded-2xl p-4">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-36 w-full sm:h-40"
        role="img"
        aria-label={`XP rising to ${finalXp} total across ${points.length} unlocks`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="ach-xp-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-gold)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--accent-gold)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Baseline, so the eye has a floor to read the curve against. */}
        <line
          x1={0}
          x2={plotWidth}
          y1={CHART_HEIGHT}
          y2={CHART_HEIGHT}
          stroke="var(--ach-hairline-strong)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        {/*
          Level bands, behind the curve and only for levels the data reaches.
          `journeyThresholds` guarantees `at <= finalXp`, so no band can appear
          above where the user actually is. Labels sit in the right margin, clear
          of the curve's end so the two never collide.
        */}
        {thresholds.map((threshold) => (
          <g key={threshold.level}>
            <line
              x1={0}
              x2={plotWidth}
              y1={y(threshold.at)}
              y2={y(threshold.at)}
              stroke="var(--accent-gold)"
              strokeOpacity={0.3}
              strokeWidth={1}
              strokeDasharray="2 5"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={plotWidth + 6}
              y={y(threshold.at) + 3}
              fontSize={9}
              fontWeight={700}
              fill="var(--accent-gold)"
              fillOpacity={0.8}
              className="tabular-nums"
            >
              L{threshold.level}
            </text>
          </g>
        ))}

        {area !== '' && <path d={area} fill="url(#ach-xp-fill)" />}

        <path
          d={line}
          fill="none"
          stroke="var(--accent-gold)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className={animationsEnabled ? 'ring-draw' : undefined}
        />

        {points.map((point, index) => (
          <circle
            key={point.id}
            cx={x(index)}
            cy={y(point.cumulativeXp)}
            r={index === points.length - 1 ? 4.5 : 3}
            fill={ACHIEVEMENT_RARITIES[point.rarity].color}
            stroke="var(--ach-surface-1)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          >
            <title>{`${point.name}: +${point.xp} XP, ${point.cumulativeXp} total`}</title>
          </circle>
        ))}
      </svg>

      {last && (
        <p className="mt-1.5 text-right text-[11px] tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{finalXp.toLocaleString()} XP</span> at
          level {last.level}
        </p>
      )}
    </div>
  );
}

/** Computed crossings, rendered as text. Never stored, never inferred in the view. */
function MilestoneList({ crossings }: { crossings: LevelCrossing[] }) {
  if (crossings.length === 0) {
    return (
      <p className="mt-2.5 text-[11px] text-muted-foreground">
        No trophy level reached yet — your first arrives at 100 XP.
      </p>
    );
  }
  return (
    <ul className="mt-2.5 flex flex-wrap gap-1.5">
      {crossings.map((crossing) => (
        <li
          key={`${crossing.level}-${crossing.id}`}
          className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--accent-gold)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-gold)_12%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-gold)]"
          title={`Reached with ${crossing.name} on ${new Date(crossing.unlockedAt).toLocaleDateString()}`}
        >
          Reached level {crossing.level}
        </li>
      ))}
    </ul>
  );
}

function MonthStepper({
  month,
  onChange,
  canGoForward,
}: {
  month: string;
  onChange: (next: string) => void;
  canGoForward: boolean;
}) {
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <div className="ach-panel-inset flex items-center gap-0.5 rounded-full p-0.5">
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Previous month"
        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-[var(--ach-surface-2)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span className="min-w-[7.5rem] px-1 text-center text-xs font-medium tabular-nums text-foreground">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={!canGoForward}
        aria-label="Next month"
        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-[var(--ach-surface-2)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none"
      >
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function CadenceGrid({
  calendar,
  month,
  today,
}: {
  calendar: ReturnType<typeof cadenceMonth>;
  month: string;
  today: string;
}) {
  const todayKey = today.slice(0, 7);
  return (
    <div className="ach-panel rounded-2xl p-4">
      <div className="mb-1.5 grid grid-cols-7 gap-1.5">
        {WEEKDAY_INITIALS.map((initial, index) => (
          <span
            key={`${initial}-${index}`}
            className="text-center text-[10px] font-semibold uppercase text-muted-foreground"
          >
            {initial}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {calendar.weeks.flat().map((cell, index) => {
          const isToday = cell.dayKey !== null && cell.dayKey === today && month === todayKey;
          return (
            <div
              key={`${cell.dayKey ?? 'pad'}-${index}`}
              title={
                cell.dayKey === null
                  ? undefined
                  : cell.count === 0
                    ? `${cell.dayKey}: no unlocks recorded`
                    : `${cell.dayKey}: ${cell.count} unlock${cell.count === 1 ? '' : 's'}`
              }
              className={cn(
                'relative flex aspect-square items-center justify-center rounded-lg text-[11px] font-semibold tabular-nums transition-transform duration-150',
                cell.level === 'strong'
                  ? 'text-white shadow-[0_2px_10px_-2px_var(--accent-habits)]'
                  : cell.level === 'light'
                    ? 'bg-[color-mix(in_oklab,var(--accent-habits)_32%,transparent)] text-foreground'
                    : 'bg-[var(--ach-surface-3)] text-muted-foreground/70',
                // Hover only where there is something to hover *for*. An empty day
                // still lifts slightly, because its tooltip is the honest "no
                // unlocks recorded" message rather than nothing.
                cell.dayKey !== null && 'hover:scale-110 hover:ring-1 hover:ring-[var(--ach-hairline-strong)] motion-reduce:transform-none motion-reduce:transition-none',
                isToday && 'ring-2 ring-[var(--accent-gold)] ring-offset-1 ring-offset-[var(--ach-surface-1)]'
              )}
              // The `strong` fill is mixed toward near-black rather than using the raw
              // accent: white on the raw `--accent-habits` is 3.1:1 in light mode,
              // and this cell's label is small text, which needs 4.5:1.
              style={
                cell.level === 'strong'
                  ? { backgroundColor: accentFill('var(--accent-habits)') }
                  : undefined
              }
              aria-hidden={cell.dayKey === null}
            >
              {cell.dayKey ? Number(cell.dayKey.slice(-2)) : ''}
              {isToday && (
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 text-[7px] font-bold uppercase text-[var(--accent-gold)]"
                >
                  •
                </span>
              )}
            </div>
          );
        })}
      </div>

      <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground">
        <li className="inline-flex items-center gap-1.5">
          <span
            className="h-3 w-3 rounded bg-[var(--ach-surface-3)]"
            aria-hidden="true"
          />
          No unlocks recorded
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span
            className="h-3 w-3 rounded bg-[color-mix(in_oklab,var(--accent-habits)_32%,transparent)]"
            aria-hidden="true"
          />
          1 unlock
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-[var(--accent-habits)]" aria-hidden="true" />
          {CADENCE_STRONG_THRESHOLD}+ unlocks
        </li>
      </ul>

      {/* Same wrapper rationale as the XP table above: `sr-only` on a bare <table>
          lets table layout grow the box past the viewport. */}
      <div className="sr-only">
        <table>
          <caption>{`Unlocks per day in ${month}`}</caption>
          <tbody>
            {calendar.weeks
              .flat()
              .filter((cell) => cell.dayKey !== null && cell.count > 0)
              .map((cell) => (
                <tr key={cell.dayKey ?? ''}>
                  <th scope="row">{cell.dayKey}</th>
                  <td>{cell.count}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Month-on-month, with the suppressed case rendered as its own state.
 *
 * The `insufficient` branch is the point: a user with one week of history must not
 * be shown "0 this month vs 0 last month", which reads as a collapse in activity
 * rather than an absence of history.
 */
function TrendCard({ model }: { model: MonthOnMonthModel }) {
  if (model.status === 'insufficient') {
    return (
      <div className="ach-panel rounded-2xl px-4 py-5">
        <p className="text-sm text-muted-foreground">
          {model.reason === 'no-history' ? (
            <>Nothing to compare yet — unlock a badge to start the record.</>
          ) : (
            <>
              A month-on-month comparison needs unlocks across{' '}
              <span className="font-medium text-foreground">two calendar months</span>. Your history
              covers one so far, so there is no honest comparison to draw.
            </>
          )}
        </p>
      </div>
    );
  }

  const direction = model.delta > 0 ? 'up' : model.delta < 0 ? 'down' : 'level';
  const accent =
    model.delta > 0
      ? 'var(--accent-habits)'
      : model.delta < 0
        ? 'var(--accent-streak)'
        : 'var(--muted-foreground)';

  return (
    <div className="ach-panel flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl p-5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          This month
        </p>
        <p
          className="font-display text-4xl font-bold leading-none tabular-nums"
          style={{ color: model.thisMonth > 0 ? accent : 'var(--muted-foreground)' }}
        >
          {model.thisMonth}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          unlock{model.thisMonth === 1 ? '' : 's'}
        </p>
      </div>

      <div className="h-12 w-px bg-[var(--ach-hairline)]" aria-hidden="true" />

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Last month
        </p>
        <p className="font-display text-4xl font-bold leading-none tabular-nums text-muted-foreground">
          {model.lastMonth}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          unlock{model.lastMonth === 1 ? '' : 's'}
        </p>
      </div>

      <p className="min-w-[12rem] flex-1 text-xs leading-relaxed text-muted-foreground">
        {model.delta === 0 ? (
          <>Level with last month — nothing changed.</>
        ) : (
          <>
            <span
              className="font-semibold"
              style={{ color: accent }}
            >
              {Math.abs(model.delta)} {Math.abs(model.delta) === 1 ? 'unlock' : 'unlocks'} {direction}
            </span>{' '}
            than last month.
          </>
        )}
      </p>
    </div>
  );
}