'use client';

/**
 * The year heatmap: a GitHub-style contribution matrix.
 *
 * ## Layout contract
 *
 * `grid-flow-col grid-rows-7`. Every day is a cell; the grid places seven cells
 * per column and flows into the next column, so **row index is the weekday** and
 * **column index is the week** with no per-column wrappers to get out of step.
 *
 * Deliberately NOT nested flex columns. A month axis positioned over a flex grid
 * is aligned by guesswork, and when the guess is wrong the label still looks
 * authoritative — which is worse than no label. Here the axis is its own grid
 * built from the *same* `repeat()` template as the matrix, so a label's column
 * and its week column are the same number by construction.
 *
 * Nothing here is absolutely positioned, and no cell is ever omitted: the year is
 * rendered as 52-53 columns of seven whether the user has logged one day or three
 * hundred. Empty days are skeleton boxes, because an omitted cell and an unscored
 * day must not look the same.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { HEAT_EDGE, HEAT_FILL, heatBoxShadow } from '@/components/dashboard-ui/tokens';
import {
  buildYearView,
  MONTH_LABELS,
  type ContributionDay,
} from '@/lib/dashboard/contributions';
import { cn } from '@/lib/utils';

const CELL_PX = 12;
const GAP_PX = 3;
const LG_CELL_PX = 20;

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * All seven weekday names, and all seven VISIBLE.
 *
 * This was `new Set([1, 3, 5])` with the rest rendered `text-transparent` - a
 * deliberate-looking Mon / Wed / Fri axis. The reasoning was that seven 9px
 * labels on a 12px grid is clutter. But hiding four of the seven rows means the
 * axis lies about the matrix: a reader counting cells downward finds seven bands
 * and only three names, and cannot tell whether Tuesday exists. A row with no
 * label reads as "no data", and "no data" is exactly what this grid says
 * elsewhere.
 *
 * They fit. The gutter is `w-7` (28px) against a 3-char label at 9px, and the
 * day-type tint on the label colour carries the differentiation that dropping
 * four labels was meant to buy back.
 */
const WEEKDAY_TINT: readonly string[] = [
  'text-muted-foreground/55', // Sun
  'text-muted-foreground/85', // Mon
  'text-muted-foreground/55', // Tue
  'text-muted-foreground/85', // Wed
  'text-muted-foreground/55', // Thu
  'text-muted-foreground/85', // Fri
  'text-muted-foreground/55', // Sat
];

/** Weekend rows get a faint wash, so Sat/Sun are findable without reading labels. */
const WEEKEND_ROWS = new Set([0, 6]);

export function ContributionYearGrid({
  byDate,
  today,
  year,
  size = 'sm',
}: {
  byDate: ReadonlyMap<string, ContributionDay>;
  today: string;
  year: number;
  size?: 'sm' | 'lg';
}) {
  const reduce = useReducedMotion();
const { weeks, padding } = buildYearView(byDate, year, today);

  const cellPx = size === 'lg' ? LG_CELL_PX : CELL_PX;
  const gap = size === 'lg' ? 4 : GAP_PX;
  const cellClass = size === 'lg' ? 'h-5 w-5' : 'h-3 w-3';

  /*
    A label occupies the span of columns its month covers, placed with
    `gridColumn`. Sharing the matrix's own template is what guarantees "Jan" sits
    above January's first week; distributing twelve labels evenly is what puts
    "Jun" above April in any year that does not begin on a Monday.
  */
  const marks: { month: number; from: number; span: number }[] = [];
  weeks.forEach((week, i) => {
    const firstReal = week.find((day) => !day.pad);
    if (firstReal === undefined) return;
    const month = Number(firstReal.date.slice(5, 7));
    const last = marks[marks.length - 1];
    if (last !== undefined && last.month === month) last.span = i - last.from + 1;
    else marks.push({ month, from: i, span: 1 });
  });

  // One shared template. The matrix and the axis are both built from this, so a
  // label cannot drift from its column.
  const template = `repeat(${weeks.length}, ${cellPx}px)`;
  const rowsTemplate = `repeat(7, ${cellPx}px)`;

  return (
    <div className="min-w-0">
      {/* ── month axis: same template as the matrix, no absolute positioning ── */}
      <div className="flex" style={{ gap }}>
        <div aria-hidden="true" className="shrink-0" />
        <div
          className="grid h-3"
          style={{ gridTemplateColumns: template, columnGap: gap }}
        >
          {marks.map((mark) => (
            <span
              key={mark.month}
              className="truncate text-[9px] font-medium leading-none text-muted-foreground/85"
              style={{ gridColumn: `${mark.from + 1} / span ${Math.max(1, mark.span)}` }}
            >
              {MONTH_LABELS[mark.month - 1]}
            </span>
          ))}
        </div>
      </div>

      {/* ── matrix ── */}
      <div className="mt-1.5 flex" style={{ gap }}>
        {/* Every weekday is named. Hidden rows made the axis lie about the matrix. */}
        <div
          className="grid shrink-0 pr-1.5"
          style={{ gridTemplateRows: rowsTemplate, rowGap: gap }}
        >
          {WEEKDAY_NAMES.map((name, row) => (
            <span
              key={name}
              className={cn(
                'flex items-center text-[9px] leading-none',
                WEEKDAY_TINT[row]
              )}
              style={WEEKEND_ROWS.has(row) ? { fontStyle: 'italic' } : undefined}
            >
              {name}
            </span>
          ))}
        </div>

        <div className="min-w-0 overflow-x-auto pb-1">
          <div
            className="grid grid-flow-col grid-rows-7 justify-start"
            style={{
              gridTemplateColumns: template,
              gridAutoRows: `${cellPx}px`,
              columnGap: gap,
              rowGap: gap,
            }}
          >
            {weeks.flat().map((day, i) => {
              if (padding.has(day.date)) {
                /*
                  MUST render an element, even though it is invisible.

                  `grid-flow-col` + `grid-rows-7` advances a cell's position by
                  rendering it. Returning `null` here removed the element, so the
                  grid packed the following days upward and every column after
                  the first was off by the number of pad cells - the exact
                  misalignment this component is supposed to guarantee against,
                  reintroduced through the rendering layer after the model had
                  been fixed.

                  `invisible` keeps it out of the layout flow AND out of the
                  accessibility tree, which `null` alone does not do for a grid
                  that has already declared seven rows.
                */
                return (
                  <span
                    key={day.date}
                    aria-hidden="true"
                    className="invisible"
                    style={{ width: cellPx, height: cellPx }}
                  />
                );
              }

              const label = day.future
                ? `${day.date}: not yet`
                : `${day.date}: ${day.score !== null ? Math.round(day.score) : 'No data'}`;

              return (
                <motion.span
                  key={day.date ?? i}
                  initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    duration: 0.4,
                    ease: [0.16, 1, 0.3, 1],
                    // Left to right, so the year fills in like a sweep.
                    delay: Math.min(Math.floor(i / 7) * 0.015, 1),
                  }}
                  style={{
                    // A future day gets an outline and no fill: it is part of the
                    // calendar's structure, but it has not happened, and a filled
                    // box would read as "nothing done".
                    background: day.future ? 'transparent' : HEAT_FILL[day.level],
                    // A worked day carries a halo as well as a fill, so it reads as
                    // lit rather than merely tinted. A future day gets neither.
                    boxShadow: day.future
                      ? 'none'
                      : heatBoxShadow(day.level, HEAT_EDGE),
                    border: day.future ? '1px dashed var(--border)' : undefined,
                    width: cellPx,
                    height: cellPx,
                  }}
                  className={cn(
                    'rounded-sm transition-[filter,transform] duration-150 ease-out',
                    'hover:brightness-125 hover:-translate-y-px',
                    'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                    day.date === today && 'ring-1 ring-primary/70',
                    cellClass
                  )}
                  title={label}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The empty-grid pulse, sized from the same constants so the card does not resize
 * when the real grid lands.
 */
export function ContributionYearGridSkeleton({ columns = 26 }: { columns?: number }) {
  return (
    <div className="flex" style={{ gap: GAP_PX }} aria-hidden="true">
      <div
        className="grid shrink-0 pr-1.5"
        style={{ gridTemplateRows: `repeat(7, ${CELL_PX}px)`, rowGap: GAP_PX }}
      >
        {WEEKDAY_NAMES.map((name) => (
          <span key={name} className="h-3 w-3 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
        ))}
      </div>
      <div
        className="grid grid-flow-col grid-rows-7"
        style={{
          gridTemplateColumns: `repeat(${columns}, ${CELL_PX}px)`,
          gridAutoRows: `${CELL_PX}px`,
          columnGap: GAP_PX,
          rowGap: GAP_PX,
        }}
      >
        {Array.from({ length: columns * 7 }).map((_, i) => (
          <span
            key={i}
            className="animate-pulse rounded-sm bg-muted motion-reduce:animate-none"
            style={{ width: CELL_PX, height: CELL_PX }}
          />
        ))}
      </div>
    </div>
  );
}