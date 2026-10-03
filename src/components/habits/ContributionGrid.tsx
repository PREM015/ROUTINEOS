'use client';

/**
 * The contribution grid, its month axis, and its tooltip.
 *
 * GitHub's shape: one column per week, seven weekday rows. The first column is
 * padded up to the preceding Monday so **row index always equals the weekday** -
 * without that every column is offset by however many days the year started from a
 * Monday, and "which day am I worst at" becomes unanswerable while still looking
 * fine.
 *
 * The month axis is derived from the same column list as the grid, never laid out
 * independently, so a label cannot drift off its month when the year starts on a
 * different weekday or when February is short.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  cellBoxShadow,
  cellFill,
  describeCell,
} from '@/lib/habits/contribution-visual';
import { WEEKDAY_SHORT } from '@/lib/habits/contributions';
import type { ContributionCell, ContributionYear } from '@/lib/habits/contributions';
import { cn } from '@/lib/utils';

export const CELL_GAP = 3;

/**
 * The month axis's own box: 12px of label plus 6px of air beneath it.
 *
 * Module scope, not component scope, because BOTH sides need it: `MonthAxis`
 * renders it and the weekday gutter offsets itself by it. They were separate
 * literals — `h-3 mb-1.5` in the axis and no offset at all on the gutter — so the
 * gutter started level with the axis and **"Sun" rendered beside the month name**
 * instead of beside the first row of the matrix. One constant, two consumers,
 * no drift.
 */
const AXIS_H_PX = 12;
const AXIS_GAP_PX = 6;

/**
 * Cell box sizes.
 *
 * `px` is authoritative and every dimension is derived from it: the grid tracks,
 * the weekday gutter rows and the month axis all read `px`. `box` is kept only so
 * an individual cell can carry a matching `min-w`/`min-h` - a cell must never
 * carry its own authoritative width, or it becomes a second source of truth that
 * can disagree with the track and shift a row.
 */
export const CELL_SIZE = {
  sm: { box: 'h-[14px] w-[14px]', px: 14 },
  lg: { box: 'h-5 w-5', px: 20 },
} as const;

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const LONG_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/**
 * All seven weekdays are labelled.
 *
 * This was a `Set([1, 3, 5])` with Sun / Tue / Thu / Sat rendered
 * `text-transparent` — a Mon / Wed / Fri axis. The idea was that seven labels on
 * a small grid is clutter, but it makes the axis describe a matrix that does not
 * exist: a reader counting downward finds seven bands and three names, so every
 * unlabelled row reads as "no data", which is a state this grid uses to mean
 * something else entirely.
 *
 * Alternating opacity plus italic weekends keeps the seven readable without
 * competing with the cells, and the gutter is fixed at `w-7` so a three-char
 * label never clips the grid.
 */
const WEEKDAY_TINT: readonly string[] = [
  'text-muted-foreground/55',
  'text-muted-foreground/90',
  'text-muted-foreground/55',
  'text-muted-foreground/90',
  'text-muted-foreground/55',
  'text-muted-foreground/90',
  'text-muted-foreground/55',
];
const WEEKEND_ROWS = new Set([0, 6]);

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/** Monday = 1 ... Sunday = 7. */
function isoWeekdayOf(date: string): number {
  const dow = weekdayOf(date);
  return dow === 0 ? 7 : dow;
}

export interface GridColumn {
  /** `null` for a leading pad cell that is not a real date. */
  cells: (ContributionCell | null)[];
  /** The date at the top of this column, used for its month label. */
  anchor: string;
  month: number;
}

export function buildColumns(
  cells: ContributionCell[],
  windowStart: string
): GridColumn[] {
  if (cells.length === 0) return [];
  const columns: GridColumn[] = [];
  let current: (ContributionCell | null)[] = [];
  let anchorDate = windowStart;

  for (const cell of cells) {
    if (current.length === 0) {
      anchorDate = cell.date;
      for (let i = 0; i < isoWeekdayOf(cell.date) - 1; i++) current.push(null);
    }
    current.push(cell);
    if (current.length === 7) {
      columns.push({ cells: current, anchor: anchorDate, month: Number(anchorDate.slice(5, 7)) });
      current = [];
    }
  }
  if (current.length > 0) {
    columns.push({
      cells: current,
      anchor: anchorDate,
      month: Number(anchorDate.slice(5, 7)),
    });
  }
  return columns;
}

export function ContributionGrid({
  year,
  today,
  size = 'sm',
  showAxis = true,
}: {
  year: ContributionYear;
  today: string;
  size?: keyof typeof CELL_SIZE;
  showAxis?: boolean;
}) {
  const [hovered, setHovered] = useState<ContributionCell | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only guard for createPortal
    setMounted(true);
  }, []);

  /*
    Hover performance, and why there is no `onMouseMove`.

    The tooltip used to be repositioned by an `onMouseMove` handler that called
    `setCursor` on every pointer event. `setCursor` re-renders this component,
    which re-reconciles all 365 cells, so sweeping the pointer across the strip
    meant dozens of full-tree reconciles per second. That is the actual hover
    cost in this component - not a layout property, which the three composited
    hover rules below confirm never change.

    `onMouseEnter` is sufficient and fires once per cell: the tooltip anchors to
    the cell, not to the pointer, so following the cursor adds nothing. Keeping
    the anchor fixed also stops the tooltip from jittering when the pointer moves
    within a 14px cell.

    Keyboard parity is deliberate: `onFocus` sets the same state, so tabbing
    through the grid shows the same tooltip hovering does.
  */

  /*
    The tooltip flips against the VIEWPORT, not against the scroll container.

    The container is a horizontally-scrolling year strip and is typically far wider
    than the window, so a container-relative test would almost never flip and the
    tooltip would run off the right edge of the screen. Reading the ref during
    render for the container width was also the reason this needed a live
    subscription at all.
  */
  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const columns = buildColumns(year.cells, year.stats.windowStart);
  const names = new Map(year.habits.map((h) => [h.habitId, h.name]));
  const box = CELL_SIZE[size];

  /*
    The month a column belongs to, taken from its first REAL date.

    `buildColumns` reads the column's month from its `anchor`, and for the very
    first column that anchor is the 1 January lead-in pad when the year starts
    mid-week. Deriving it from the first non-null cell keeps the header over the
    months it actually contains.
  */
  const columnMonth = useMemo(
    () => columns.map((column) => {
      const firstReal = column.cells.find((c) => c !== null);
      return firstReal === undefined ? column.month : Number(firstReal.date.slice(5, 7));
    }),
    [columns]
  );

  /*
    One measurement per cell entered, not per pointer event.

    `clientX/clientY` would track the pointer, but the tooltip is anchored to the
    cell, so the cell's own rect is both the correct anchor and the one that
    survives the pointer leaving the element (which `onMouseLeave` handles by
    clearing state anyway).
  */
  const anchorTo = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setCursor({ x: rect.left + rect.width / 2, y: rect.top });
  };

  /*
    The gutter is locked to a fixed width, and the month axis is offset by that
    width PLUS the flex gap - computed here rather than hardcoded, because
    hardcoding is how they drift apart.

    It was `w-7` (28px) with the axis at `pl-[34px]`: 28 + 3px gap = 31px, so every
    month label sat 3px right of the column it names. A named constant means the
    next change to the gutter cannot silently break the alignment again.

    `shrink-0` is what makes the column non-collapsible. It is already there; the
    reported "the weekday column expands on hover" is not reachable from a fixed
    width plus `shrink-0`, and none of the cell hover rules touch layout.
  */
  const GUTTER_PX = 40;
  const GUTTER_GAP_PX = CELL_GAP;
  const axisOffset = GUTTER_PX + GUTTER_GAP_PX;
  const axisTotalPx = AXIS_H_PX + AXIS_GAP_PX;

  return (
    <div className="min-w-0">
      {/*
        Weekday gutter + scroller. The month axis lives INSIDE the scroller so the
        two scroll together - it used to be a sibling above the `overflow-x-auto`,
        which meant the labels stayed put while the weeks scrolled past them.
      */}
      <div className="flex" style={{ gap: GUTTER_GAP_PX }}>
        {showAxis && (
          /*
            `repeat(7, ${box.px}px)`, NOT `minmax(0, 1fr)`.

            The `1fr` rows were correct while the matrix was 53 flex columns of 7
            cells: the gutter was a flex sibling of that stack and could stretch to
            whatever height the tallest column produced. Since the matrix became a
            single `grid-rows-7` with fixed `gridAutoRows`, there is no sibling
            height to resolve against - `1fr` in an auto-height grid falls back to
            the content box, so the seven labels collapsed to text height, stopped
            lining up with the rows they name, and the axis read as detached from
            the matrix.

            Both now use the same `box.px`, so a label and its row are guaranteed
            the same height rather than merely likely to be.

            `marginTop` is the month axis's own height plus its gap. Without it
            the gutter starts level with the axis and "Sun" renders beside "Jan"
            rather than beside row 0.
          */
          <div
            className="grid shrink-0 select-none"
            style={{
              width: GUTTER_PX,
              paddingRight: 10,
              rowGap: CELL_GAP,
              marginTop: axisTotalPx,
              gridTemplateRows: `repeat(7, ${box.px}px)`,
            }}
          >
            {WEEKDAY_SHORT.map((label, row) => (
              <span
                key={label}
                className={cn(
                  'flex items-center justify-end text-[9px] leading-none',
                  WEEKDAY_TINT[row]
                )}
                style={WEEKEND_ROWS.has(row) ? { fontStyle: 'italic' } : undefined}
              >
                {label}
              </span>
            ))}
          </div>
        )}

        {/*
          No `relative`. The tooltip is `position: fixed`, and a `relative` ancestor
          would become its containing block - which would put the tooltip back
          inside the card, re-introducing the in-flow sibling that causes the row to
          re-lay-out on hover. `min-w-0` still matters: it is what lets this flex
          child shrink below its content so the strip scrolls instead of pushing
          the page wide.
        */}
        <div className="min-w-0 flex-1">
          {/*
            ONE scroll container for the month axis and the matrix together.

            They were siblings: the axis outside the `overflow-x-auto`, the grid
            inside it. That scrolls them apart the moment the strip is wider than
            the card, so the month labels slid off and stopped naming anything —
            which is why the axis looked like it had no labels on a long year. One
            scroller, axis and grid in the same flow, keeps them locked.
          */}
          <div className="overflow-x-auto pb-1">
            {showAxis && (
              <div style={{ paddingLeft: axisOffset }}>
                <MonthAxis months={columnMonth} columnCount={columns.length} cellPx={box.px} />
              </div>
            )}

            {/*
              One grid, not 53 nested flex columns.

              `grid-flow-col grid-rows-7` makes the browser own the placement: seven
              cells per column, flowing into the next. A 53-column flex tree puts
              the arithmetic back in the markup, which is what let the month axis
              and the matrix drift apart in the first place - and it is also why
              a padding cell that renders as `null` shifted every column after it.

              `gridAutoColumns` is the fixed track, so a cell's width is decided
              before layout rather than by its content.
            */}
            <div
              className="grid grid-flow-col"
              style={{
                /*
                  Rows AND columns are both explicit, both from `box.px`.

                  `grid-rows-7` alone means `repeat(7, minmax(0, 1fr))`, and `1fr`
                  in an auto-height grid resolves against content - so the row
                  height depended on each cell's contents rather than on a
                  declared track, and the weekday gutter had nothing stable to
                  match. Declaring both tracks makes the matrix a real 7 x 53 grid
                  of fixed cells, and `box.px` is the same number the gutter rows
                  use, so a label and its row are the same height by construction.
                */
                gridTemplateRows: `repeat(7, ${box.px}px)`,
                gridAutoColumns: `${box.px}px`,
                columnGap: CELL_GAP,
                rowGap: CELL_GAP,
              }}
            >
              {columns.flatMap((column, i) =>
                column.cells.map((entry, row) => {
                  if (entry === null) {
                    /*
                      MUST render an element. `grid-flow-col` advances position by
                      rendering, so returning `null` would pack every following day
                      upward and break the weekday alignment this grid exists to
                      guarantee. `invisible` holds the slot without drawing.
                    */
                    return (
                      <span
                        key={`pad-${i}-${row}`}
                        aria-hidden="true"
                        className="invisible rounded-[3px]"
                      />
                    );
                  }
                  return (
                    <button
                      key={entry.date}
                      type="button"
                      onMouseEnter={(e) => {
                        setHovered(entry);
                        anchorTo(e.currentTarget);
                      }}
                      onMouseLeave={() => {
                        setHovered(null);
                        setCursor(null);
                      }}
                      onFocus={(e) => {
                        setHovered(entry);
                        anchorTo(e.currentTarget);
                      }}
                      onBlur={() => {
                        setHovered(null);
                        setCursor(null);
                      }}
                      style={{
                        background: cellFill(entry),
                        // Hairline, green halo, today ring and miss rim in one
                        // value — see `cellBoxShadow` for why they are not
                        // separate CSS rules.
                        boxShadow: cellBoxShadow(entry, entry.date === today),
                      }}
                      /*
                        Composited states only. This is a hard constraint, not a
                        preference, and it is the whole reason hovering used to
                        move the page.

                        ALLOWED: `filter`, `transform`, `box-shadow`, `outline`,
                        `opacity`, `z-index`, `background-color`. None of these
                        participate in layout.

                        BANNED: `width`, `height`, `padding`, `margin`,
                        `border-width`, `font-weight`, and anything that toggles
                        them. `border` is the specific trap: the UA box model
                        treats a 1px border as INSIDE a fixed width, so a cell
                        that gains one on hover loses 2px of content, its hairline
                        misaligns, and — because the grid track is fixed while the
                        content is not — the row re-resolves. The hairline here is
                        an `inset` box-shadow for exactly that reason, and the
                        "today" marker in `globals.css` is an OUTER shadow.

                        `focus-visible:outline-none` is paired with a ring on
                        purpose: the ring is a box-shadow, so removing the
                        default outline costs no visibility and no layout. Do not
                        drop one without the other.
                      */
                      className={cn(
                        'rounded-[3px] transition-[filter,transform,box-shadow] duration-150 ease-out',
                        'hover:z-10 hover:brightness-110 hover:-translate-y-px',
                        'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/80',
                        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                        box.box
                      )}
                      data-today={entry.date === today ? 'true' : undefined}
                      aria-label={`${longDate(entry.date)}: ${describeCell(entry)}`}
                    />
                  );
                })
              )}
            </div>
          </div>

          {/*
            The tooltip goes to `document.body`, not here.

            `position: fixed` is only viewport-relative when nothing between it
            and the viewport establishes a containing block — and the card it sits
            inside is `.glass-panel`, which sets `backdrop-filter`. A
            `backdrop-filter`, `filter`, `transform` or `will-change` ancestor ALL
            capture `position: fixed` descendants, so the tooltip's viewport
            coordinates were being resolved against the card's padding box instead.
            It rendered tens or hundreds of pixels off-target, appearing to jump
            around on every hover — which reads as the card breaking.

            A portal is the fix that survives the next glass surface, the next
            animation or the next transform. `mounted` guards the SSR pass, where
            `document` does not exist.
          */}
          {mounted && hovered && cursor
            ? createPortal(
                <ContributionTooltip
                  cell={hovered}
                  x={cursor.x}
                  y={cursor.y}
                  viewportWidth={viewport}
                  names={hovered.completedHabitIds
                    .map((id) => names.get(id))
                    .filter((n): n is string => typeof n === 'string')}
                />,
                document.body
              )
            : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Month labels, positioned against the real columns.
 *
 * A label is emitted on the column where its month first appears, and given the
 * full width of the following span, so `Jan` sits over January's first week rather
 * than being evenly distributed across 12 slots - which is what puts `Jun` over
 * April in any year that does not begin on a Monday.
 */
export function MonthAxis({
  months,
  columnCount,
  cellPx,
}: {
  /** One month number per column, in order. */
  months: number[];
  columnCount: number;
  cellPx: number;
}) {
  const marks: { month: number; from: number; span: number }[] = [];
  months.forEach((month, i) => {
    const last = marks[marks.length - 1];
    if (last !== undefined && last.month === month) last.span = i - last.from + 1;
    else marks.push({ month, from: i, span: 1 });
  });

  /*
    The same `repeat()` template the matrix uses, so a label's column IS its
    month's first week. Absolutely-positioned labels over a flex grid are aligned
    by guesswork, and a guess that is wrong still looks authoritative.

    `width: max-content` so the track is as wide as the whole strip rather than
    the viewport: inside an `overflow-x-auto`, a `1fr`-width track would keep the
    labels pinned to the visible left edge while the weeks scrolled past them.
  */
  return (
    <div
      className="shrink-0 grid items-start"
      style={{
        gridTemplateColumns: `repeat(${columnCount}, ${cellPx}px)`,
        columnGap: CELL_GAP,
        height: AXIS_H_PX,
        marginBottom: AXIS_GAP_PX,
        width: columnCount * (cellPx + CELL_GAP) - CELL_GAP,
      }}
    >
      {marks.map((mark) => (
        <span
          key={mark.month}
          className="truncate text-[10px] font-medium leading-none text-muted-foreground/85"
          style={{ gridColumn: `${mark.from + 1} / span ${Math.max(1, mark.span)}` }}
        >
          {MONTH_LABELS[mark.month - 1]}
        </span>
      ))}
    </div>
  );
}

function ContributionTooltip({
  cell,
  x,
  y,
  viewportWidth,
  names,
}: {
  cell: ContributionCell;
  x: number;
  y: number;
  viewportWidth: number;
  names: string[];
}) {
  const width = 232;
  // Flip toward the pointer when there is not room to its right. Measured against
  // the viewport, because the grid scrolls horizontally inside a container wider
  // than the window.
  const flip = viewportWidth > 0 && x + width + 16 > viewportWidth;
  const left = flip ? Math.max(8, x - width - 12) : x + 12;

  return (
    <div
      role="tooltip"
      className="glass-overlay pointer-events-none fixed z-50 rounded-[14px] p-3 shadow-floating"
      style={{ left, top: y + 14, width }}
    >
      <p className="text-[11px] font-semibold text-muted-foreground">{longDate(cell.date)}</p>

      {cell.state === 'UNSCHEDULED' ? (
        <>
          <p className="mt-1.5 text-sm font-semibold text-foreground">Rest day</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">No habits scheduled</p>
        </>
      ) : (
        <>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span className="font-display text-lg font-bold leading-none tabular-nums text-foreground">
              {cell.completed}
              <span className="text-muted-foreground">/{cell.scheduled}</span>
            </span>
            <span className="text-[11px] text-muted-foreground">habits completed</span>
          </p>
          {cell.rate !== null && (
            <p className="mt-1 text-[11px] font-semibold tabular-nums text-foreground">
              {cell.rate}% completion
            </p>
          )}
          <dl className="mt-2 space-y-0.5 border-t border-border/60 pt-2 text-[11px]">
            <Row label="Scheduled" value={String(cell.scheduled)} />
            <Row label="Completed" value={String(cell.completed)} />
            {cell.missed > 0 && <Row label="Missed" value={String(cell.missed)} />}
            {cell.skipped > 0 && <Row label="Skipped" value={String(cell.skipped)} />}
          </dl>
          {names.length > 0 && (
            <p className="mt-2 border-t border-border/60 pt-2 text-[10px] leading-snug text-muted-foreground">
              {names.join(' · ')}
            </p>
          )}
          {cell.state === 'NO_RECORD' && (
            <p className="mt-2 text-[10px] leading-snug text-muted-foreground/80">
              Nothing was logged, so this day is unknown rather than missed.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function longDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${LONG_WEEKDAYS[weekdayOf(date)]}, ${LONG_MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}
