'use client';

/**
 * The Months view - a *different question*, not a bigger version of the same grid.
 *
 * ## Why it is not a resize
 *
 * | | Year view | Months view |
 * | - | - | - |
 * | Question | "Am I trending up or down?" | "How did October actually go?" |
 * | Shape | 53 week-columns, 14px cells | 12 month blocks, 30px cells |
 * | Reading | a texture; scan for rhythm | a calendar; read individual days |
 * | Works for | anyone with a year of history | someone three weeks in |
 *
 * The year strip is illegible for a new user: 53 columns of 14px cells is a wall,
 * and the one day they have logged is a single dot in it. The month view gives
 * that same user a readable grid, so it is the **default** below 14 scheduled
 * days - while remaining selectable at any time.
 *
 * ## The same invariant
 *
 * A `null` cell is one that does not exist - February has no 30th, and a month
 * beyond today has not happened. It renders as nothing. A `0` cell - a real day
 * with nothing done - renders with the same neutral floor as the year view, so
 * the two views never disagree about what a day means.
 */

import { useMemo, useState } from 'react';
import {
  cellBoxShadow,
  cellFill,
  describeCell,
REST_CELL_EDGE,
REST_CELL_FILL,
} from '@/lib/habits/contribution-visual';
import {
  MONTH_LABELS,
  type ContributionCell,
  type ContributionYear,
} from '@/lib/habits/contributions';
import { cn } from '@/lib/utils';

/**
 * A day block in the month view. Fixed, so it is the same at every breakpoint.
 *
 * Six of these plus the gaps is the width of the widest month block, which is what
 * the auto-fit track below is sized against.
 */
const MONTH_CELL = 22;

const LONG_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function isoWeekdayOf(date: string): number {
  const dow = weekdayOf(date);
  return dow === 0 ? 7 : dow;
}

interface MonthCell {
  date: string;
  day: number;
  entry: ContributionCell | null;
  /** Monday = 0 ... Sunday = 6, for the row layout. */
  row: number;
  col: number;
}

/**
 * Lay a month out Monday-first.
 *
 * Day 1 sits in the row for its own weekday, and the grid fills rightward, so a
 * month reads as a calendar. `null` fills the leading blanks and the days past the
 * end of the month, and is rendered as nothing at all.
 */
function buildMonth(
  year: number,
  month: number,
  byDate: ReadonlyMap<string, ContributionCell>
): { cells: MonthCell[]; columns: number } {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const leading = isoWeekdayOf(`${prefix}-01`) - 1;
  const columns = Math.ceil((leading + daysInMonth) / 7);

  const cells: MonthCell[] = [];
  for (let i = 0; i < leading; i++) {
    const row = i;
    cells.push({
      date: '',
      day: 0,
      entry: null,
      row: row % 7,
      col: Math.floor(row / 7),
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${prefix}-${String(d).padStart(2, '0')}`;
    const slot = leading + d - 1;
    cells.push({
      date,
      day: d,
      entry: byDate.get(date) ?? null,
      row: slot % 7,
      col: Math.floor(slot / 7),
    });
  }

  return { cells, columns };
}

export function ContributionMonths({
  year,
  today,
  size = 'sm',
}: {
  year: ContributionYear;
  today: string;
  size?: 'sm' | 'lg';
}) {
  const [hover, setHover] = useState<{ cell: MonthCell; x: number; y: number } | null>(null);
  const cellPx = size === 'lg' ? 28 : MONTH_CELL;

  const byDate = useMemo(
    () => new Map(year.cells.map((c) => [c.date, c])),
    [year.cells]
  );

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const built = buildMonth(year.stats.year, month, byDate);
        const summary = year.months.find((m) => m.month === month);

        /*
          One row per real day, for the `lg` day-level readout.

          `REST` is separate from `MISS` and from `NO_RECORD` on purpose: it is the
          only state where the cell is not a judgement, and folding it into either
          of the others would make "I did nothing" and "I wasn't asked" print the
          same thing — which is the distinction the whole three-state model exists
          to keep.
        */
        const dayCounts = built.cells
          .filter((c) => c.entry !== null && c.date !== '')
          .map((c) => ({
            date: c.date,
            day: c.day,
            completed: c.entry?.completed ?? 0,
            scheduled: c.entry?.scheduled ?? 0,
            state:
              c.entry === null || c.entry.scheduled === 0
                ? ('REST' as const)
                : c.entry.state === 'LOGGED_MISS'
                  ? ('MISS' as const)
                  : c.entry.completed === 0
                    ? ('NO_RECORD' as const)
                    : ('COMPLETE' as const),
          }));

        return { month, ...built, summary, dayCounts };
      }),
    [year, byDate]
  );

  /*
    A month is "future" only when the user has not reached ANY of it.

    This was `summary.days === 0`, and `days` used to mean "days inside the
    scoring window". Since the grid started spanning the whole year, every month
    has cells, so `days === 0` was never true again and the check silently became
    dead — but the placeholder branch was still wired to it, which is how a month
    can be "empty" by a definition nothing computes.

    The honest test is whether the month starts after today, and a month is
    rendered as a real grid either way: an empty-but-reached month is a month the
    user lived through with nothing in it, and showing it as a grid of rest days
    is the truthful thing. Only the unreachable ones collapse to a ghost.
  */
  const reachedMonth = Number(today.slice(5, 7));
  const isCurrentYear = year.stats.year === Number(today.slice(0, 4));
  const monthIsFuture = (month: number) => isCurrentYear && month > reachedMonth;

  /*
    Explicit responsive columns, NOT `auto-fit`.

    `auto-fit` + `minmax(152px, 1fr)` was a mistake: an auto-fit track resolves
    against its container's width, so as soon as an ancestor constrained that
    width (a `max-w-fit` wrapper, a sidebar, a narrower panel) the tracks
    collapsed toward the minimum and all twelve months stacked down a single
    narrow centred column, with the rest of the page empty. A media-query
    column count cannot collapse that way - it is a declaration about the
    viewport, not a negotiation with the parent.

    The 152px month block is the reason `xl:grid-cols-4` stops at four: a fifth
    column at 1280px would hand each block ~230px and re-introduce the wide-
    margin look in miniature.
  */
  return (
    // No `relative` here: the tooltip host is `position: fixed` at the viewport
    // origin, so it is not positioned against this element. A `relative` ancestor
    // would become its containing block and put the tooltip back inside the card,
    // re-introducing the in-flow sibling that re-lays-out the month row on hover.
    <div className="min-w-0">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map(({ month, cells, columns, summary, dayCounts }) => {
          const future = monthIsFuture(month);
          // A reached month with no activity is NOT empty in the "nothing here"
          // sense - it is a lived month in which nothing was completed. It gets a
          // real grid of neutral cells, which is exactly what it looks like.
          const activeDays = summary?.activeDays ?? 0;

          return (
            <div key={month} className={cn('min-w-0', future && 'opacity-45')}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h4 className="truncate text-[11px] font-semibold text-foreground">
                  {MONTH_LABELS[month - 1]}
                </h4>
                {!future && (
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    <span className="font-semibold text-foreground">{activeDays}</span>
                    {' active'}
                  </span>
                )}
              </div>

              {future ? (
                /*
                  A compact tile with a ghost preview, not a dashed void.

                  The old version was a 132px dashed rectangle with one line of
                  centred text - the tallest thing in the row, containing the
                  least information, which is why the month list looked like a
                  column of empty drawers. This keeps the same footprint as a
                  real month so the grid stays on a baseline, but the shape of a
                  calendar is still faintly there, and the label no longer has a
                  dashed border competing with the real cells.
                */
                <div className="flex flex-col items-center justify-center gap-2 rounded-[10px] border border-border/40 bg-muted/20 px-2 py-3">
                  {/*
                    Only the ghost preview is hidden from assistive tech. The tile
                    as a whole must NOT be `aria-hidden`, or a screen-reader user
                    loses "No activity" - the single fact this tile exists to
                    convey.
                  */}
                  <div className="grid grid-cols-6 gap-[3px] opacity-50" aria-hidden="true">
                    {Array.from({ length: columns > 0 ? columns : 6 }).map((_, i) => (
                      <span key={i} className="h-[3px] w-full rounded-full bg-muted-foreground/25" />
                    ))}
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground/60">
                    Not yet
                  </span>
                </div>
              ) : (
                <div
                  className="flex justify-center"
                >
                <div
                  className="grid gap-1"
                  /*
                    FIXED cell width, not `minmax(0, 1fr)`.

                    With fraction-width columns, a month block inherits a share of
                    whatever the grid gives it: at four blocks per row on a wide
                    screen a 6-column month produced ~48px cells, and `aspect-square`
                    made them 48x48 — a wall of giant numbered squares. A fixed
                    `MONTH_CELL` keeps a day the same size at every breakpoint, and
                    `justify-center` centres the shorter months (February) in their
                    column instead of stretching them.
                  */
                  style={{ gridTemplateColumns: `repeat(${columns}, ${cellPx}px)` }}
                >
                  {cells.map((cell, i) =>
                    cell.entry === null ? (
                      /*
                        A day with no cell — outside the clipped window, or a day
                        the month does not have — still gets the neutral floor and
                        the hairline. An empty span renders as *nothing*, so a month
                        that starts before the user's first habit rendered as blank
                        space rather than as days they were never asked to do.
                      */
                      <span
                        key={`gap-${month}-${i}`}
                        aria-hidden="true"
                        style={{
                          background: REST_CELL_FILL,
                          boxShadow: `inset 0 0 0 1px ${REST_CELL_EDGE}`,
                          width: cellPx,
                          height: cellPx,
                        }}
                        className="rounded-[4px]"
                      />
                    ) : (
                      <button
                        key={cell.date}
                        type="button"
                        onMouseEnter={(e) => {
                          setHover(anchorMonthTooltip(e.currentTarget, cell));
                        }}
                        onMouseLeave={() => setHover(null)}
                        onFocus={(e) => {
                          setHover(anchorMonthTooltip(e.currentTarget, cell));
                        }}
                        onBlur={() => setHover(null)}
                        style={{
                          background: cellFill(cell.entry),
                          // Hairline, green halo, today ring and miss rim in one
                          // value — see `cellBoxShadow`.
                          boxShadow: cellBoxShadow(cell.entry, cell.date === today),
                          width: cellPx,
                          height: cellPx,
                        }}
                        data-today={cell.date === today ? 'true' : undefined}
                        data-miss={
                          cell.entry.state === 'LOGGED_MISS' ? 'true' : undefined
                        }
                        className={cn(
                          'flex items-center justify-center rounded-[4px] font-semibold leading-none text-white/85 transition-[filter,transform] duration-150 ease-out hover:brightness-110 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/80 motion-reduce:transition-none',
                          size === 'lg' ? 'text-[12px]' : 'text-[10px]'
                        )}
                        aria-label={`${LONG_WEEKDAYS[weekdayOf(cell.date)]}, ${MONTH_LABELS[month - 1]} ${cell.day}: ${describeCell(cell.entry)}`}
                      >
                        {cell.day}
                      </button>
                    )
                  )}
                </div>
                </div>
              )}

              {summary && !future && (
                <p className="mt-1.5 text-[10px] tabular-nums text-muted-foreground">
                  {activeDays === 0
                    ? summary.scheduledTotal === 0
                      ? 'nothing scheduled'
                      : 'no activity'
                    : `${summary.rate}% of ${summary.scheduledTotal} due`}
                </p>
              )}

              {/*
                Day-level counts, so a month answers "how many did I do on the
                14th" without a hover. `size === 'lg'` only: at 22px the cells are
                already showing the date number and a second glyph is unreadable,
                and twelve months x 31 numbers is a wall of text at the small size.

                Rendered as text inside the cell rather than a second element so
                the tooltip's `closest()` walk and the grid's one-node-per-day
                structure both stay intact.
              */}
              {summary && !future && size === 'lg' && (
                <ul className="mt-2 grid gap-x-3 text-[11px] tabular-nums text-muted-foreground" style={{ gridTemplateColumns: `repeat(${Math.min(columns, 7)}, minmax(0, 1fr))` }}>
                  {dayCounts.map((row) => (
                    <li key={row.date} className="flex items-center justify-between gap-1">
                      <span className="text-foreground/80">{row.day}</span>
                      <span className={cn('font-semibold', row.state === 'COMPLETE' && 'text-emerald-500', row.state === 'MISS' && 'text-destructive/80', row.state === 'REST' && 'text-muted-foreground/50')}>
                        {row.state === 'REST' ? '—' : `${row.completed}/${row.scheduled}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/*
        The tooltip host, and the fix for the hover bug.

        This was `absolute inset-0` - a full-size, IN-FLOW sibling of the twelve
        month grids. Two problems, both caused by the same mistake:

        1. `absolute inset-0` sizes itself to the host, and it is a flex/grid
           sibling of the months. Every time hover state changed, this element
           re-laid-out, which re-resolved the sibling month tracks and visibly
           shifted the whole row - the "container shifting on hover" symptom.
        2. It sits inside the host rather than over it, so it was also picking up
           the host's `opacity` transition as the card faded, and it could not be
           positioned against the viewport at all.

        It is now `fixed` and zero-sized: out of flow, so it contributes nothing
        to any track, and coordinates are viewport-space like the year view's
        tooltip. `pointer-events-none` means it can never intercept the hover that
        produced it. The tooltip inside it is `fixed` as well, so this wrapper is
        a positioning no-op and exists only to carry `aria-hidden` and the
        `data-month-host` hook.

        `hidden` rather than conditional rendering: the element is inert either
        way, and keeping it mounted avoids a mount/unmount on every cell change.
      */}
      <div
        data-month-host
        className="pointer-events-none fixed left-0 top-0 h-0 w-0"
        aria-hidden={!hover}
      >
        {hover && hover.cell.entry && (
          <MonthTooltip
            cell={hover.cell.entry}
            x={hover.x}
            y={hover.y}
            flipRight={hover.x > 320}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Where a month's tooltip goes, in VIEWPORT coordinates.
 *
 * The host is `fixed` at the origin with zero size, so the cell's own client rect
 * is already the right answer - no host measurement and no subtraction. That
 * removes the two `getBoundingClientRect()` calls this used to make per hover,
 * each of which forced a synchronous layout of the whole month row.
 */
function anchorMonthTooltip(element: HTMLElement, cell: MonthCell) {
  const rect = element.getBoundingClientRect();
  return { cell, x: rect.left + rect.width / 2, y: rect.top };
}

function MonthTooltip({
  cell,
  x,
  y,
  flipRight,
}: {
  cell: ContributionCell;
  x: number;
  y: number;
  flipRight: boolean;
}) {
  const width = 210;
  return (
    <div
      role="tooltip"
      /*
        `fixed`, not `absolute`.

        It was `absolute` inside a host that is itself `fixed` and zero-sized, so
        it resolved against a 0x0 box at the viewport origin and only happened to
        land correctly. Making the tooltip `fixed` itself removes the indirection:
        `x`/`y` are viewport coordinates from `anchorMonthTooltip`, and a fixed
        element takes them literally, so the zero-size wrapper can never be the
        thing that positions it.
      */
      className="glass-overlay pointer-events-none fixed z-30 rounded-[12px] p-2.5 text-[11px] shadow-floating"
      style={{ left: flipRight ? x - width - 10 : x + 10, top: y + 12, width }}
    >
      {cell.state === 'UNSCHEDULED' ? (
        <>
          <p className="font-semibold text-foreground">Rest day</p>
          <p className="mt-0.5 text-muted-foreground">No habits scheduled</p>
        </>
      ) : (
        <>
          <p className="font-semibold text-foreground">
            {cell.completed}/{cell.scheduled} completed
          </p>
          {cell.rate !== null && (
            <p className="mt-0.5 tabular-nums text-muted-foreground">{cell.rate}% completion</p>
          )}
        </>
      )}
    </div>
  );
}
