'use client';

/**
 * JournalCalendar — a month index of journal activity. Each day is coloured by
 * the mood recorded that day (1 = red … 5 = green), which makes the calendar a
 * visual index of the journal rather than a picker.
 *
 * The month is driven by the caller. This component does not fetch: the page
 * loads the displayed month's entries once and passes them in, so the calendar
 * and the list cannot issue competing requests for the same month, and a filter
 * change in the list does not silently repaint the calendar.
 *
 * Keyboard: the grid is a roving-tabindex `grid`. Arrow keys move by a day,
 * PageUp/PageDown by a month, Home/End to the row ends. Announcements go
 * through a polite live region rather than a tooltip, so the date and its mood
 * are readable without hovering.
 *
 * Usage:
 *   <JournalCalendar month={month} cells={cells} onMonthChange={setMonth}
 *                    selectedDate={date} onSelectDate={open} />
 */
import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MOOD_COLORS, MOOD_FALLBACK_COLOR, moodLabel } from '@/constants/journal';
import { calendarGrid, coerceMonthKey, formatDateKey, shiftDateKey, shiftMonth } from '@/lib/journal/date';
import { cn } from '@/lib/utils';

const DAYS_PER_WEEK = 7;

/**
 * Weekday headers: the abbreviation that is displayed, and the full name that is
 * announced.
 *
 * Two separate values on purpose. Reusing the abbreviation for `aria-label` — as
 * this did — means the label is "Thu" and the visible text is "Thu", so a screen
 * reader says "thu" and the fix for the abbreviation problem is a no-op.
 */
const WEEKDAYS: ReadonlyArray<{ short: string; full: string }> = [
  { short: 'Sun', full: 'Sunday' },
  { short: 'Mon', full: 'Monday' },
  { short: 'Tue', full: 'Tuesday' },
  { short: 'Wed', full: 'Wednesday' },
  { short: 'Thu', full: 'Thursday' },
  { short: 'Fri', full: 'Friday' },
  { short: 'Sat', full: 'Saturday' },
];

export interface JournalCalendarCell {
  /** `YYYY-MM-DD`. */
  date: string;
  mood: number | null;
  entryId?: string;
  isFavorite?: boolean;
}

export interface JournalCalendarProps {
  /** Displayed month as `YYYY-MM`. */
  month: string;
  /** Per-day data for that month. */
  cells: JournalCalendarCell[];
  /** Called when the user pages to another month. */
  onMonthChange?: (month: string) => void;
  /** Called with a `YYYY-MM-DD` when a day is activated. */
  onSelectDate: (date: string) => void;
  /** Highlighted day, e.g. the day whose entry is open. */
  selectedDate?: string;
  /** The user's today, as `YYYY-MM-DD`. */
  today?: string;
  loading?: boolean;
  className?: string;
}

/** `2026-03` → `March 2026`. */
function monthLabel(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(year ?? 1970, (monthIndex ?? 1) - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Accessible name for a day cell: the full date, then what was recorded.
 * "March 4, 2026, mood 4, Good" rather than "2026-03-04, mood 4/5", because the
 * first thing a screen reader needs is a date a person would say out loud.
 */
function cellLabel(date: string, cell: JournalCalendarCell | undefined): string {
  const datePart = formatDateKey(date);
  if (!cell) return `${datePart}, no entry`;
  const label = moodLabel(cell.mood);
  return label ? `${datePart}, mood ${cell.mood}, ${label}` : `${datePart}, entry, mood not recorded`;
}

export default function JournalCalendar({
  month,
  cells,
  onMonthChange,
  onSelectDate,
  selectedDate,
  today,
  loading = false,
  className,
}: JournalCalendarProps) {
  /*
   * `coerceMonthKey`, not `isValidMonthKey`: `month` is already typed `string`, so a
   * `value is string` predicate would narrow the *else* branch to `never` and make any
   * fallback unreachable to the compiler. `coerceMonthKey` takes a string and returns a
   * valid key, which is what this call site wants.
   */
  const safeMonth = coerceMonthKey(month);
  const dates = React.useMemo(() => calendarGrid(safeMonth), [safeMonth]);

  /**
   * The grid split into weeks.
   *
   * `calendarGrid` returns a flat list padded to a multiple of seven; the rows
   * have to be real elements for the grid's row structure to survive in the
   * accessibility tree, so the chunking happens here rather than being flattened
   * back out by a `display:contents` wrapper.
   */
  const rows = React.useMemo(() => {
    const weeks: Array<Array<string | null>> = [];
    for (let i = 0; i < dates.length; i += 7) weeks.push(dates.slice(i, i + 7));
    return weeks;
  }, [dates]);

  const cellByDate = React.useMemo(() => {
    const map: Record<string, JournalCalendarCell> = {};
    for (const cell of cells) map[cell.date] = cell;
    return map;
  }, [cells]);

  /**
   * Which day holds focus.
   *
   * A roving tabindex rather than 31 tab stops: the grid is one stop in the page
   * order and the arrow keys move within it, which is what the grid pattern
   * requires and what a keyboard user expects from a calendar.
   */
  const [focusedDate, setFocusedDate] = React.useState<string | null>(
    selectedDate ?? today ?? dates.find((date): date is string => date !== null) ?? null
  );
  const dayRefs = React.useRef(new Map<string, HTMLButtonElement>());

  // Follow the month: when it changes, focus has to move somewhere inside the
  // new grid or focus is stranded on a button that no longer exists.
  React.useEffect(() => {
    const firstOfMonth = dates.find((date): date is string => date !== null);
    if (!firstOfMonth) return;
    setFocusedDate((current) =>
      current && current.startsWith(safeMonth) ? current : firstOfMonth
    );
  }, [safeMonth, dates]);

  const stepMonth = (delta: number) => {
    const next = shiftMonth(safeMonth, delta);
    if (next !== safeMonth) onMonthChange?.(next);
  };

  /** Move focus by `delta` days without changing the displayed month. */
  const moveFocus = (date: string, delta: number) => {
    const target = shiftDateKey(date, delta);
    if (!target) return;

    // Crossing a month boundary hands off to the caller rather than tracking a
    // second month internally, so the grid always shows the month it can focus.
    if (target.slice(0, 7) !== safeMonth) {
      onMonthChange?.(target.slice(0, 7));
      // Focus follows on the render that shows the new month.
      window.setTimeout(() => {
        dayRefs.current.get(target)?.focus();
        setFocusedDate(target);
      }, 0);
      return;
    }

    setFocusedDate(target);
    dayRefs.current.get(target)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, date: string) => {
    // 0-based day of the month, which is the column offset within the week row.
    const dayIndex = Number(date.slice(8, 10)) - 1;

    const actions: Record<string, () => void> = {
      ArrowLeft: () => moveFocus(date, -1),
      ArrowRight: () => moveFocus(date, 1),
      ArrowUp: () => moveFocus(date, -7),
      ArrowDown: () => moveFocus(date, 7),
      PageUp: () => stepMonth(-1),
      PageDown: () => stepMonth(1),
      // Home and End move to the ends of the *week row*, which is what the grid
      // pattern specifies. `End` used to jump to the last day of the month, which
      // from the first row threw away four weeks of the grid in one keypress.
      Home: () => moveFocus(date, -dayIndex),
      End: () => moveFocus(date, DAYS_PER_WEEK - 1 - dayIndex),
    };

    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  /**
   * What the live region says.
   *
   * A polite region rather than `aria-live` on the grid itself: moving focus
   * already announces the newly focused button's label, and duplicating it
   * would read the date twice.
   */
  const focusedCell = focusedDate ? cellByDate[focusedDate] : undefined;
  const announcement =
    focusedDate && focusedDate.startsWith(safeMonth)
      ? `${cellLabel(focusedDate, focusedCell)}${
          focusedCell?.isFavorite ? ', favorite' : ''
        }`
      : '';

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground" aria-live="off">
          {monthLabel(safeMonth)}
        </h3>
        <div className="flex items-center gap-1">
          {/* h-10 (40px) rather than h-8: these and the day cells are the only
              touch targets in the calendar, and 32px is well under the ~44px
              minimum. */}
          <button
            type="button"
            onClick={() => stepMonth(-1)}
            aria-label="Previous month"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => stepMonth(1)}
            aria-label="Next month"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        {/*
          Rows are real elements carrying `role="row"` rather than a
          `display:contents` wrapper. `contents` removes the row from the
          accessibility tree in several browser/AT combinations, which silently
          drops the row structure the grid pattern depends on. Each row is its
          own 7-column grid, so the visual result is unchanged.
        */}
        <div
          role="grid"
          aria-label={`Journal activity for ${monthLabel(safeMonth)}`}
          aria-busy={loading}
          className="space-y-1"
        >
          <div role="row" className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((weekday) => (
              <div
                key={weekday.short}
                role="columnheader"
                aria-label={weekday.full}
                className="pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                <span aria-hidden="true">{weekday.short}</span>
              </div>
            ))}
          </div>

          {rows.map((row, rowIndex) => (
            <div key={`row-${rowIndex}`} role="row" className="grid grid-cols-7 gap-1">
              {row.map((date, index) => {
                if (!date) {
                  return (
                    <div
                      key={`blank-${rowIndex}-${index}`}
                      role="gridcell"
                      aria-hidden="true"
                      className="h-10"
                    />
                  );
                }

                const cell = cellByDate[date];
                const mood = cell?.mood ?? null;
                const color =
                  mood !== null && mood !== undefined
                    ? (MOOD_COLORS[mood] ?? MOOD_FALLBACK_COLOR)
                    : null;
                const isToday = date === today;
                const isSelected = date === selectedDate;
                const hasEntry = cell !== undefined;
                const isFocused = date === focusedDate;

                return (
                  // The gridcell wraps the button rather than being one: a
                  // `role="gridcell"` on the <button> would replace its button
                  // role, and the day would stop being announced as activatable.
                  <div key={date} role="gridcell" aria-selected={isSelected}>
                    <button
                      type="button"
                      // Stable hook for tests and for the parent to correlate a
                      // cell with its date; the accessible name is prose and not
                      // a reliable selector.
                      data-date={date}
                      ref={(node) => {
                        if (node) dayRefs.current.set(date, node);
                        else dayRefs.current.delete(date);
                      }}
                      // One tab stop for the whole grid; arrows move within it.
                      tabIndex={isFocused ? 0 : -1}
                      onClick={() => onSelectDate(date)}
                      onFocus={() => setFocusedDate(date)}
                      onKeyDown={(event) => handleKeyDown(event, date)}
                      aria-label={cellLabel(date, cell)}
                      aria-current={isToday ? 'date' : undefined}
                      className={cn(
                        'relative flex h-10 w-full items-center justify-center rounded-md border text-sm font-medium transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                        color
                          ? 'text-white shadow-sm hover:brightness-95'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted',
                        // A day with an entry but no recorded mood still needs to
                        // read as "written" — it is the neutral state between
                        // nothing and a coloured cell, and a bare border does not
                        // convey it.
                        hasEntry && !color && 'border-dashed border-border bg-muted/40',
                        isSelected &&
                          'ring-2 ring-primary ring-offset-1 ring-offset-background',
                        !isSelected && isToday && 'border-primary'
                      )}
                      style={color ? { backgroundColor: color } : undefined}
                    >
                      {Number(date.slice(8, 10))}
                      {cell?.isFavorite && (
                        <span
                          aria-hidden="true"
                          className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-current opacity-70"
                        />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Polite, not assertive: keyboard navigation should not interrupt. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <span>Mood</span>
        {Object.entries(MOOD_COLORS).map(([value, hex]) => (
          <span key={value} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: hex }}
              aria-hidden="true"
            />
            {value}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-border"
            aria-hidden="true"
          />
          written
        </span>
      </div>
    </div>
  );
}
