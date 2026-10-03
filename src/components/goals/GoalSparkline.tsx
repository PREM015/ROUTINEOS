'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { EASE } from '@/lib/motion';
import { PACE_COLOR } from '@/constants/goals';
import { buildSparkline, type GoalLike, type GoalPace, type ProgressPoint } from '@/lib/goals/goal-metrics';
import { cn } from '@/lib/utils';

/**
 * ## Trajectory sparkline — a flight-recorder replay of the path so far
 *
 * One point per day of cumulative progress share, drawn left to right. Unlike the
 * habit heatmap this is a **line**, because the thing being shown is a direction
 * over time rather than a set of independent daily outcomes.
 *
 * The dashed diagonal behind it is the **glide path** — where progress would sit
 * if it tracked the calendar exactly. Same `elapsedShare` the Pace Track's ghost
 * marker uses, extended across the whole window so the curve can be read against
 * the ideal it is deviating from, not only against a single point.
 *
 * `null` points (no log row yet) break the line rather than dropping to zero.
 * A goal with no history must render as an empty axis, not as a collapse.
 */

export interface GoalSparklineProps {
  goal: GoalLike;
  points: ProgressPoint[];
  today: string;
  pace: GoalPace;
  /** Width in px; height is fixed so the curve keeps its aspect in the drawer. */
  width?: number;
  height?: number;
  className?: string;
}

const PAD_X = 2;
const PAD_Y = 4;

export function GoalSparkline({
  goal,
  points,
  today,
  pace,
  width = 520,
  height = 120,
  className,
}: GoalSparklineProps) {
  const reduced = useReducedMotion();
  const series = buildSparkline(points, goal, today);

  if (series.length === 0) return null;

  const innerW = Math.max(1, width - PAD_X * 2);
  const innerH = Math.max(1, height - PAD_Y * 2);
  const color = PACE_COLOR[pace.state];

  const x = (index: number) => PAD_X + (index / (series.length - 1)) * innerW;
  const y = (share: number) => PAD_Y + (1 - share) * innerH;

  /**
   * Split into runs of consecutive non-null points so each is drawn as its own
   * path. One path with a single `M` restarted per gap keeps the gaps genuinely
   * empty — a naive "connect everything" polyline would draw a straight line
   * across a fortnight the user never touched, inventing data.
   */
  const runs: string[] = [];
  let current: string[] = [];
  series.forEach((point, index) => {
    if (point.value === null) {
      if (current.length > 1) runs.push(current.join(' '));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`);
  });
  if (current.length > 1) runs.push(current.join(' '));

  /**
   * Every emitted point is already bounded to `today` by `buildSparkline`, so no
   * run needs filtering against the axis: the data is the history, and the
   * history stops today because that is when today is.
   */
  const hasAnyData = runs.length > 0;

  /**
   * The glide path runs from the goal's start to today, expressed as a share of
   * the window that has elapsed. When the window has not opened yet the line
   * would sit entirely off the left edge, so it is suppressed rather than drawn
   * as a stub.
   */
  const glideStartIndex = series.findIndex((p) => p.date >= goal.startDate);
  const glide =
    glideStartIndex >= 0
      ? { fromX: x(glideStartIndex), toX: x(series.length - 1) }
      : null;

  return (
    <div className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={describeSparkline(series, pace)}
      >
        {/* Glide path — the honest reference, drawn first and behind everything. */}
        {glide && (
          <line
            x1={glide.fromX}
            y1={y(0)}
            x2={glide.toX}
            y2={y(pace.elapsedShare)}
            stroke="var(--pace-rail-inset)"
            strokeWidth={1}
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Baseline: the target line, at the top. */}
        <line
          x1={PAD_X}
          y1={y(1)}
          x2={width - PAD_X}
          y2={y(1)}
          stroke="var(--pace-rail)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        {runs.map((run, index) => (
          <motion.path
            key={index}
            d={run}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            initial={reduced ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{
              duration: reduced ? 0 : 0.7,
              ease: EASE,
              delay: reduced ? 0 : index * 0.08,
            }}
          />
        ))}

        {/* Today marker: where the replay ends. */}
        <line
          x1={x(series.length - 1)}
          y1={PAD_Y}
          x2={x(series.length - 1)}
          y2={height - PAD_Y}
          stroke="var(--pace-on)"
          strokeWidth={1}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />

        {!hasAnyData && (
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            fill="var(--muted-foreground)"
            fontSize={11}
          >
            No progress logged yet
          </text>
        )}
      </svg>
    </div>
  );
}

function describeSparkline(
  series: Array<{ date: string; value: number | null }>,
  pace: GoalPace
): string {
  const logged = series.filter((p) => p.value !== null).length;
  const latest = [...series].reverse().find((p) => p.value !== null);

  const parts = [
    `Progress trajectory over the last ${series.length} days.`,
    `${logged} ${logged === 1 ? 'day has' : 'days have'} logged progress.`,
  ];
  if (latest?.value !== null && latest?.value !== undefined) {
    parts.push(`Latest: ${Math.round(latest.value * 100)}% of target.`);
  }
  parts.push(`Current pace: ${pace.state.replace('_', ' ')}.`);
  return parts.join(' ');
}