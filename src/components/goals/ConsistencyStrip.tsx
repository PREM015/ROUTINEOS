'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ConsistencySummary } from '@/lib/goals/goal-metrics';

/**
 * ## Consistency strip — 30 days, one square per day
 *
 * Same visual grammar as the habit contribution heatmap, goal-scoped: the fastest
 * way to answer "is this thing something I actually do, or something I once
 * declared?"
 *
 * ### The three-state problem this exists to solve
 *
 * `GoalProgress` records what was *done*. There is no row for "opened the app
 * and did not do it", and no row for "never opened the app" — the schema cannot
 * tell those apart. So a day can only honestly be one of four things, and a
 * two-colour strip (done / not done) has to lie about two of them:
 *
 * | Day state        | Drawn as | Why it is not a miss |
 * | ---------------- | -------- | --------------------- |
 * | `done`           | filled   | — |
 * | `missed`         | hollow, outlined | the goal applied and produced no row |
 * | `not_applicable` | dotted   | the goal did not apply that day at all |
 * | `pending`        | ringed   | today, and the day is not over |
 *
 * `pending` is the one that matters most and is easiest to get wrong: rendering
 * an unfinished today as a miss reports a failure for a day that has not happened
 * yet. It is drawn as an open ring, which is also what keeps a live streak from
 * *appearing* broken all morning.
 */

export interface ConsistencyStripProps {
  summary: ConsistencySummary;
  /** Hides the streak numerals for very dense layouts. */
  showStreak?: boolean;
  className?: string;
}

export function ConsistencyStrip({
  summary,
  showStreak = true,
  className,
}: ConsistencyStripProps) {
  const reduced = useReducedMotion();

  // Nothing to show when the goal never applied in the window. Rendering 30
  // dotted squares for a goal that starts next month is noise that reads as
  // "30 missed days" at a glance.
  if (summary.applicableDays === 0) return null;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className="flex flex-1 items-end gap-[2px]"
        role="img"
        aria-label={describe(summary)}
      >
        {summary.days.map((day, index) => (
          <Tooltip key={day.date} day={day.state} date={day.date}>
            <motion.span
              className={cn(
                'block h-2.5 w-[7px] shrink-0 rounded-[2px]',
                reduced ? '' : 'transition-opacity duration-150'
              )}
              style={cellStyle(day.state)}
              initial={reduced ? false : { opacity: 0, scaleY: 0.4 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={{
                duration: reduced ? 0 : 0.25,
                // Only the trailing days animate in; a 30-square cascade on
                // every list render is the kind of decoration this page is not
                // allowed.
                delay: reduced ? 0 : Math.min(index, 14) * 0.012,
              }}
            />
          </Tooltip>
        ))}
      </div>

      {showStreak && summary.streak > 0 && (
        <span
          className="shrink-0 font-display text-xs tabular-nums text-muted-foreground"
          title={`${summary.streak}-day streak`}
        >
          {summary.streak}d
        </span>
      )}
    </div>
  );
}

function cellStyle(state: ConsistencySummary['days'][number]['state']): React.CSSProperties {
  switch (state) {
    case 'done':
      return { background: 'var(--pace-ahead)', opacity: 0.9 };
    case 'missed':
      return {
        background: 'transparent',
        boxShadow: 'inset 0 0 0 1px var(--pace-rail-inset)',
      };
    case 'pending':
      return {
        background: 'transparent',
        boxShadow: 'inset 0 0 0 1.5px var(--pace-on)',
      };
    default:
      return { background: 'var(--pace-idle-wash)' };
  }
}

/**
 * Spoken description of the whole strip.
 *
 * Not a per-day list: 30 individual cells are announced as an unreadable wall of
 * dates. The count plus the streak is the fact a screen-reader user actually
 * wants, and each square is separately reachable on hover for the rest.
 */
function describe(summary: ConsistencySummary): string {
  const parts = [
    `${summary.doneDays} of ${summary.applicableDays} applicable days done in the last 30 days`,
  ];
  if (summary.streak > 0) parts.push(`current streak ${summary.streak} days`);
  if (summary.completionRate !== null) {
    parts.push(`${Math.round(summary.completionRate * 100)}% completion`);
  }
  return parts.join('. ');
}

function Tooltip({
  day,
  date,
  children,
}: {
  day: ConsistencySummary['days'][number]['state'];
  date: string;
  children: React.ReactNode;
}) {
  return (
    <span className="group/strip relative inline-flex" title={`${date} — ${DAY_LABEL[day]}`}>
      {children}
    </span>
  );
}

const DAY_LABEL: Record<ConsistencySummary['days'][number]['state'], string> = {
  done: 'done',
  missed: 'missed',
  not_applicable: 'not applicable',
  pending: 'still open',
};