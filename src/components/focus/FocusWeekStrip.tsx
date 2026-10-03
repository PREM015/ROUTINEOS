'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { FOCUS_METRIC_DEFAULTS } from '@/lib/focus/metrics';

/**
 * The seven-day focus strip.
 *
 * ## Why the data comes from the API, not from a client-side re-bucket
 *
 * `GET /api/focus/stats` already returns a **dense** `days` array - one entry per
 * day in range, including days with no sessions - because a gap in a bar chart reads
 * as missing data rather than as a day off. Re-bucketing the same window on the
 * client would be a second implementation of the same rule, which is precisely how
 * the four-definitions-of-"scheduled" problem started. So the bars are driven
 * straight off the server's buckets.
 *
 * That also retired `useFocusWeek`, which computed its own buckets from raw
 * `FocusMetricRow`s and had no callers.
 *
 * ## Why there is a table under the bars
 *
 * Bar height encodes minutes and nothing else does, so the numbers are unavailable
 * to anyone not looking at the screen. The bars are therefore `aria-hidden`
 * decoration and the real content is a visually hidden table carrying the same
 * figures. Screen readers navigate a table properly, where a row of styled divs
 * would be announced as unlabelled numbers.
 *
 * "met" is also written as text rather than shown only as a colour, which is what
 * lets it survive High Contrast Mode, where the fill colours are replaced by the
 * user's system palette.
 */

export interface FocusWeekDay {
  date: string;
  focusMinutes: number;
  completedSessions: number;
  partialSessions: number;
}

export interface FocusWeekStripProps {
  days: FocusWeekDay[];
  /** Minutes that make a day count for the streak. */
  threshold?: number;
  className?: string;
}

/** "2h 05m". Zero renders as "0m" - a bare "0h 0m" is noise. */
export function formatFocusMinutes(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, '0')}m`;
}

export function FocusWeekStrip({
  days,
  threshold = FOCUS_METRIC_DEFAULTS.streakDayMinutes,
  className,
}: FocusWeekStripProps) {
  const peak = useMemo(
    () => days.reduce((max, day) => (day.focusMinutes > max ? day.focusMinutes : max), 0),
    [days]
  );

  if (days.length === 0) return null;

  return (
    <div className={cn('focus-week-strip', className)}>
      {/* Decoration only - the table below is the accessible content. */}
      <div className="flex items-end gap-1.5" aria-hidden="true">
        {days.map((day) => {
          const met = day.focusMinutes >= threshold;
          const ratio = peak > 0 ? day.focusMinutes / peak : 0;
          return (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              {/* A day with no focus still needs a visible slot, so the minimum height
                  is a hairline rather than zero - otherwise "did nothing" renders as a
                  gap and reads as missing data instead of a real zero. */}
              <div
                data-focus-week-bar=""
                data-met={met}
                className={cn('w-full rounded-sm', met ? 'bg-accent-focus' : 'bg-muted')}
                style={{ height: `${Math.max(2, Math.round(ratio * 48))}px` }}
              />
              <span className="text-[0.625rem] text-muted-foreground">
                {format(parseISO(day.date), 'EEE')}
              </span>
            </div>
          );
        })}
      </div>

      <table className="sr-only">
        <caption>Focus time per day for the last {days.length} days</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Focus time</th>
            <th scope="col">Sessions completed</th>
            <th scope="col">Sessions counted as partial</th>
            <th scope="col">Met daily target</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th scope="row">{format(parseISO(day.date), 'EEEE d MMMM')}</th>
              <td>{formatFocusMinutes(day.focusMinutes)}</td>
              <td>{day.completedSessions}</td>
              <td>{day.partialSessions}</td>
              <td>{day.focusMinutes >= threshold ? 'met' : 'short'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A one-sentence spoken summary of the window.
 *
 * Separate from the table on purpose: a table is *navigated*, not read out. This is
 * the "how was the week" sentence a screen-reader user hears without going looking
 * for the numbers, and it is what the live region carries.
 */
export function summariseFocusWeek(
  days: FocusWeekDay[],
  threshold = FOCUS_METRIC_DEFAULTS.streakDayMinutes
): string {
  if (days.length === 0) return '';
  const total = days.reduce((sum, day) => sum + day.focusMinutes, 0);
  const met = days.filter((day) => day.focusMinutes >= threshold).length;
  return `${days.length} days, ${formatFocusMinutes(total)} total, ${met} of ${days.length} met the ${threshold}-minute target`;
}

export default FocusWeekStrip;