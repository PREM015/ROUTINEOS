'use client';

import { useEffect, useState } from 'react';

/**
 * The Gantt's vertical scale, chosen from the width it actually has.
 *
 * ## Why this is measured rather than a media query
 *
 * `pxPerMinute` decides every block's height *and* its `top`, in JavaScript, at
 * layout time. A CSS media query can shrink a font but it cannot re-run
 * `buildGanttLayout`, so it cannot shrink a chart whose geometry is computed. The
 * scale has to be known before the layout is derived, which means measuring the
 * container and re-deriving when it changes.
 *
 * The alternative — one scale for all widths — was the previous behaviour and it
 * is the bug this fixes. A ~1800px day chart is fine on a 1440px screen and
 * absurd on a 360px one, where the user is already scrolling vertically and now
 * scrolls 1200px to see a single evening.
 *
 * ## The tiers
 *
 * | width     | px/min | floor | 30 min | 1h   | 3h   |
 * |-----------|-------:|------:|-------:|-----:|-----:|
 * | < 560px   |    1.4 |   60  |   60px |  84  | 252  |
 * | >= 560px  |    2.0 |   60  |   60px | 120  | 360  |
 *
 * Only two tiers, deliberately. An earlier three-tier version reduced the floor
 * as well as the scale, which broke the one ratio the whole chart exists to
 * express: a 3-hour block is exactly 6x a 30-minute one. Holding the floor at 60
 * and moving the scale keeps the desktop guarantee intact and still makes a phone
 * scroll less.
 *
 * ## The floor is not negotiable
 *
 * 60px is where a block can hold a timestamp and a title at a readable size. Drop
 * it further on narrow screens and short blocks become unreadable slivers, which
 * trades a real usability problem for a cosmetic one. The card drops its optional
 * rows instead — see `ScheduleBlock`.
 *
 * ## SSR
 *
 * The first render uses the wide tier. Measuring needs a layout pass, and a
 * chart that is briefly over-scaled and then settles is far less jarring than one
 * that is briefly under-scaled — the latter would make every block jump upward
 * on load, which reads as a bug.
 */
export interface TimelineScale {
  pxPerMinute: number;
  minRowHeight: number;
}

const WIDE: TimelineScale = { pxPerMinute: 2, minRowHeight: 60 };
const NARROW: TimelineScale = { pxPerMinute: 1.4, minRowHeight: 60 };

function scaleForWidth(width: number): TimelineScale {
  return width < 560 ? NARROW : WIDE;
}

/**
 * @param ref The scroll container the chart is drawn inside. A `ResizeObserver`
 *   rather than a window listener, so the chart responds to a sidebar opening or
 *   a panel resizing — not just to the window.
 */
export function useTimelineScale(ref: React.RefObject<HTMLElement | null>): TimelineScale {
  const [scale, setScale] = useState<TimelineScale>(WIDE);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const width = element.clientWidth;
      if (width === 0) return;
      const next = scaleForWidth(width);
      // Identity check first: setState with a fresh object re-renders the chart
      // and re-derives the whole layout on every resize frame.
      setScale((current) =>
        current.pxPerMinute === next.pxPerMinute && current.minRowHeight === next.minRowHeight
          ? current
          : next
      );
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return scale;
}

export default useTimelineScale;
