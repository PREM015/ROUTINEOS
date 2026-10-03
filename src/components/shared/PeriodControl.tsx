'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PERIOD_LABEL, PERIOD_ORDER, shiftAnchor, type Period } from '@/lib/period-range';
import { DEFAULT_TZ } from '@/lib/dates';
import { useCallback, useId, useMemo, useRef } from 'react';

interface PeriodControlProps {
  period: Period;
  onPeriodChange: (period: Period) => void;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  todayLabel?: string;
  className?: string;
  size?: 'sm' | 'md';
  /**
   * The anchor date currently in view, and the newest anchor the user may
   * navigate to (normally today, in their timezone).
   *
   * Together they disable the "next" arrow once the visible period already
   * contains the present. It used to be always enabled, so a user could walk
   * forward into periods that have not happened and land on an empty dashboard
   * with no explanation. Omit `maxAnchor` to keep navigation unbounded (the
   * small `RoutineWidget` variant, which is scoped to its own data).
   */
  anchorDate?: string;
  maxAnchor?: string;
  /**
   * Id of the element this control drives.
   *
   * The tabs below are a real ARIA tablist, and a tablist is only correct if each
   * tab names the panel it controls. That panel is rendered by the *caller* — the
   * dashboard body, the recap body — so the caller supplies the id and puts the
   * matching `role="tabpanel"` on its own content. The default keeps the roving
   * focus and arrow keys working for a caller that has not wired a panel yet,
   * rather than emitting `aria-controls` pointing at nothing.
   */
  panelId?: string;
  /**
   * IANA zone used for the period math. Required whenever `anchorDate` and
   * `maxAnchor` are supplied — it is the 4th parameter of `shiftAnchor`.
   */
  timezone?: string;
}

/**
 * Shared period navigator used by the Recap page and the dashboard Routine
 * Progress widget so both surfaces expose identical navigation semantics.
 */
export function PeriodControl({
  period,
  onPeriodChange,
  label,
  onPrev,
  onNext,
  onToday,
  todayLabel = 'Today',
  className,
  size = 'md',
  anchorDate,
  maxAnchor,
  panelId,
  timezone = DEFAULT_TZ,
}: PeriodControlProps) {
  const tabSize = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm';
  // `p-1`/`p-1.5` around a 16px icon is a 24-28px target, well under the ~44px
  // minimum for touch. The buttons are sized to the target instead of the glyph.
  const navSize = size === 'sm' ? 'p-2.5' : 'p-3';
  const arrowClass = 'h-4 w-4';
  const labelClass = size === 'sm' ? 'text-xs' : 'text-sm';
  const todayClass = size === 'sm' ? 'text-xs' : 'text-sm';

  const generatedPanelId = useId();
  const controls = panelId ?? generatedPanelId;
  const tabRefs = useRef(new Map<Period, HTMLButtonElement>());

  // Disabled once stepping forward would leave the current period, i.e. when
  // the period already in view contains today. String comparison is safe: both
  // operands are `YYYY-MM-DD` wall-clock labels produced by `shiftAnchor`.
  //
  // NOTE the 4th argument to `shiftAnchor` is the *timezone*, not a bound.
  // Passing `maxAnchor` there previously made `fromZonedTime(..., "2026-09-28")`
  // return an Invalid Date, so `format()` threw `RangeError: Invalid time value`
  // and crashed the whole /analytics page. Hence the explicit `timezone` prop.
  const atCurrentPeriod = useMemo(() => {
    if (!anchorDate || !maxAnchor) return false;
    try {
      return shiftAnchor(anchorDate, period, 1, timezone) > maxAnchor;
    } catch {
      // Never let a date-arithmetic failure take the page down; worst case the
      // arrow stays enabled.
      return false;
    }
  }, [anchorDate, maxAnchor, period, timezone]);

  /*
    Arrow keys, Home and End, per the ARIA tabs pattern.

    A tablist is one tab stop, not four: Tab should move past the whole strip, and
    the arrow keys move within it. Every button was independently tabbable before,
    which meant a keyboard user tabbed through all four periods on their way to the
    date label — four stops to express a choice the widget had already made.

    Selection follows focus, which is what the pattern prescribes for an
    automatic-activation tablist, and it is also what the previous behaviour
    already did on click: the period changes the moment it is chosen, so making
    the arrow keys wait for Enter would desynchronise the strip from the page.
  */
  const focusTab = useCallback((next: Period) => {
    tabRefs.current.get(next)?.focus();
    onPeriodChange(next);
  }, [onPeriodChange]);

  const onTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = PERIOD_ORDER.indexOf(period);
      let nextIndex: number | null = null;

      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          nextIndex = (currentIndex + 1) % PERIOD_ORDER.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          nextIndex = (currentIndex - 1 + PERIOD_ORDER.length) % PERIOD_ORDER.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = PERIOD_ORDER.length - 1;
          break;
        default:
          return;
      }

      const next = PERIOD_ORDER[nextIndex];
      if (!next) return;
      event.preventDefault();
      focusTab(next);
    },
    [focusTab, period]
  );

  return (
    // Wraps below ~640px. The control is a five-tab strip plus two arrows, a
    // 150px label and a link: at 375px that is wider than the viewport, and the
    // un-wrappable row pushed the "Today" link off-screen entirely.
    <div className={cn('flex flex-wrap items-center justify-center gap-2 sm:justify-start', className)}>
      <div
        className="flex items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5"
        role="tablist"
        aria-label="Reporting period"
      >
        {PERIOD_ORDER.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            id={`${controls}-tab-${p}`}
            aria-selected={period === p}
            aria-controls={controls}
            tabIndex={period === p ? 0 : -1}
            ref={(node) => {
              if (node) {
                tabRefs.current.set(p, node);
              } else {
                tabRefs.current.delete(p);
              }
            }}
            onKeyDown={onTabKeyDown}
            onClick={() => onPeriodChange(p)}
            className={cn(
              'rounded-md font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              tabSize,
              period === p
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous period"
        className={cn(
          'rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          navSize
        )}
      >
        <ChevronLeft className={arrowClass} />
      </button>
      <span
        className={cn(
          // `min-w` only until it runs out of room, then the label wraps
          // instead of forcing the row wider than the viewport.
          'font-semibold text-foreground tabular-nums text-center min-w-0 flex-1 basis-[150px] break-words',
          labelClass
        )}
      >
        {label || '\u2014'}
      </span>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next period"
        disabled={atCurrentPeriod}
        className={cn(
          'rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:pointer-events-none disabled:opacity-40',
          navSize
        )}
      >
        <ChevronRight className={arrowClass} />
      </button>
      <button
        type="button"
        onClick={onToday}
        className={cn(
          'rounded-md px-2 py-1.5 font-semibold text-primary hover:underline break-keep',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          todayClass
        )}
      >
        {todayLabel}
      </button>
    </div>
  );
}