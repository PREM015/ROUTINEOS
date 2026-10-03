'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { EASE } from '@/lib/motion';
import { PACE_COLOR } from '@/constants/goals';
import type { GoalPace } from '@/lib/goals/goal-metrics';

/**
 * Fixed viewBox width. The SVG scales to its container via
 * `preserveAspectRatio="none"`, so this is a coordinate space rather than a
 * pixel width — 100 units maps to however wide the card happens to be.
 */
const W = 100;

/**
 * ## The inline trajectory
 *
 * The smallest version of {@link GoalSparkline}, sized for a card rather than the
 * drawer. Same idea, three differences:
 *
 * 1. **No glide-path reference.** At 36px tall a dashed diagonal is visual noise,
 *    and the card already carries the Pace Track — whose ghost marker *is* the
 *    reference, at the current moment. Drawing it twice would answer the same
 *    question in two places.
 * 2. **No today marker.** Same reason. The card's job is the shape of the path,
 *    not the position on the axis.
 * 3. **It draws once, from the left, and then never again.** The drawer's
 *    sparkline animates on open because opening is an explicit act. A card
 *    animates on every filter change, every tab switch and every progress write,
 *    and twelve cards doing that at once is a wave — which reads as decoration
 *    and costs a compositor pass per card.
 *
 * `null` points (no log row yet) break the line rather than dropping to zero, so
 * a goal with no history renders as an empty axis, never as a collapse to
 * nothing.
 */

export interface MiniTrajectoryProps {
  /** `buildSparkline` output for this goal. */
  shape: Array<{ date: string; value: number | null }>;
  pace: GoalPace;
  height?: number;
  className?: string;
}

export function MiniTrajectory({
  shape,
  pace,
  height = 36,
  className,
}: MiniTrajectoryProps) {
  const reduced = useReducedMotion();

  /**
   * Derived directly, with no `useMemo`.
   *
   * `shape` is already memoised per goal id in `useGoalsViewData`, so the
   * expensive half of this — `buildSparkline` walking 30 days — happens once per
   * goal per load. What is left is a 30-element scan and some string building,
   * which is well under the cost of the memo bookkeeping and, more importantly,
   * keeps the React Compiler's manual-memoisation check satisfied: a `useMemo`
   * here returned different shapes on different branches, which the compiler
   * cannot preserve and bails on — taking the whole component's optimisation
   * with it.
   */
  const paths = (() => {
    if (shape.length < 2) return [];

    const pad = 1.5;
    const x = (i: number) => (i / (shape.length - 1)) * W;
    const y = (v: number) => pad + (1 - v) * (height - pad * 2);

    const runs: string[] = [];
    let current: string[] = [];

    shape.forEach((point, i) => {
      if (point.value === null) {
        if (current.length > 1) runs.push(current.join(' '));
        current = [];
        return;
      }
      current.push(
        `${current.length === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(point.value).toFixed(2)}`
      );
    });
    if (current.length > 1) runs.push(current.join(' '));

    return runs;
  })();

  // The endpoint dot: the one thing the curve cannot say about itself. A flat
  // line at 40% and a flat line at 90% have identical slope; only the dot's
  // height separates them.
  let latest: { x: number; y: number } | null = null;
  for (let i = shape.length - 1; i >= 0; i -= 1) {
    const value = shape[i]?.value;
    if (value !== null && value !== undefined) {
      const pad = 1.5;
      latest = {
        x: (i / (shape.length - 1)) * W,
        y: pad + (1 - value) * (height - pad * 2),
      };
      break;
    }
  }

  if (paths.length === 0) return null;

  const colour = PACE_COLOR[pace.state];

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/*
        A flat baseline at the target, so a curve's *height* reads as "distance
        left". Two hairline endpoints do more for reading a small chart than axis
        labels ever do.
      */}
      <line
        x1={0}
        y1={1}
        x2={W}
        y2={1}
        stroke="var(--pace-rail)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />

      {paths.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          fill="none"
          stroke={colour}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{
            duration: reduced ? 0 : 0.65,
            ease: EASE,
            // Staggered by 40ms across runs, capped: a goal with many gaps
            // should not take a second and a half to finish drawing.
            delay: reduced ? 0 : Math.min(i * 0.04, 0.2),
          }}
        />
      ))}

      {latest && (
        <circle
          cx={latest.x}
          cy={latest.y}
          r={1.6}
          fill={colour}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

export default MiniTrajectory;
