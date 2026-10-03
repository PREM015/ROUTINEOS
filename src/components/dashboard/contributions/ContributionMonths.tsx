'use client';

/**
 * The LeetCode-style streak calendar: one block per calendar month, cells
 * numbered by day of the month.
 *
 * ## Why this shape and not the year strip
 *
 * The year strip is a texture. It is the right shape for "am I trending up or
 * down" and the wrong shape for "how did October actually go", because a 52-week
 * column run forces the eye to count across weeks to find a month. Month blocks
 * with real day numbers are the unit people remember.
 *
 * ## The two facts this must not fudge
 *
 *  1. **A gap is a gap.** `null` means no stored `DailyScore` row for that date —
 *     never scored. It renders as an empty cell, never as a zero-tinted one.
 *  2. **February has no 30th.** `null` also means "this month has no such day",
 *     which is a different fact from "you did not log" and looks identical in the
 *     data. Drawing either as a tinted cell would invent a day.
 *
 * Both cases are the same `null`, which is why the cell never guesses: it either
 * prints the day number and a heat level, or it prints nothing at all.
 */

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { HEAT_EDGE, HEAT_FILL, heatBoxShadow } from '@/components/dashboard-ui/tokens';
import {
  buildMonthView,
  MONTH_LABELS,
  type ContributionDay,
} from '@/lib/dashboard/contributions';
import { REST_CELL_EDGE, REST_CELL_FILL } from '@/lib/habits/contribution-visual';
import { cn } from '@/lib/utils';

export function ContributionMonths({
  byDate,
  year,
  today,
  size = 'sm',
}: {
  byDate: ReadonlyMap<string, ContributionDay>;
  year: number;
  today: string;
  size?: 'sm' | 'lg';
}) {
  const reduce = useReducedMotion();
  const { months } = useMemo(() => buildMonthView(byDate, year, today), [byDate, year, today]);

  const cellPx = size === 'lg' ? 20 : 18;
  const cell = size === 'lg' ? 'h-5 w-5 text-[10px]' : 'h-[18px] w-[18px] text-[8px]';

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {months.map((block, monthIndex) => {
        const columns = block.grid[0]?.length ?? 0;
        return (
          <motion.div
            key={block.key}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              ease: [0.16, 1, 0.3, 1],
              delay: Math.min(monthIndex * 0.04, 0.5),
            }}
            className="shrink-0"
          >
            <p className="mb-1 text-[10px] font-medium text-muted-foreground">
              {MONTH_LABELS[block.month - 1]}
              {block.activeDays > 0 && (
                <span className="ml-1 tabular-nums text-muted-foreground/60">
                  {block.activeDays}
                </span>
              )}
            </p>

            <div
              className="grid gap-[3px] justify-center"
              /*
                FIXED cell width. With `minmax(0, 1fr)` a month block inherits
                whatever width the outer grid hands it, so at twelve blocks per row
                a 6-column month produced near-40px cells - a wall of oversized
                squares. Fixed px keeps a day the same size at every breakpoint.
              */
              style={{ gridTemplateColumns: `repeat(${columns}, ${cellPx}px)` }}
            >
              {block.grid.flat().map((day, i) =>
                day === null ? (
                  /*
                    A day with no cell - outside the loaded window, or a day the
                    month does not have - still gets a visible body.

                    It previously rendered as an empty span, which is *nothing*: a
                    month that began before the user's first score looked like a
                    blank block rather than like days they were never scored. The
                    floor and hairline match every other empty day, so the calendar's
                    structure stays legible and only scored days carry the ramp.
                  */
                  <span
                    key={`${block.key}-gap-${i}`}
                    aria-hidden="true"
                    style={{
                      background: REST_CELL_FILL,
                      boxShadow: `inset 0 0 0 1px ${REST_CELL_EDGE}`,
                    }}
                    className={cn('h-[18px] w-[18px] rounded-[3px]', size === 'lg' && 'h-5 w-5')}
                  />
                ) : (
                  <span
                    key={day.date}
                    style={{
                      background: HEAT_FILL[day.level],
                      boxShadow: heatBoxShadow(day.level, HEAT_EDGE),
                    }}
                    className={cn(
                      'flex items-center justify-center rounded-[3px] font-semibold tabular-nums',
                      'text-white/85 transition-[filter,transform] duration-150 ease-out',
                      'hover:brightness-125 hover:-translate-y-px',
                      'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                      day.date === today && 'ring-1 ring-primary',
                      cell
                    )}
                    title={`${day.date}: ${
                      day.score !== null ? Math.round(day.score) : 'No data'
                    }`}
                  >
                    {Number(day.date.slice(8))}
                  </span>
                )
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
