import { describe, it, expect } from 'vitest';
import { isCalendarDate, calendarDaysBetween, shiftCalendarDay } from '@/lib/dates';

/**
 * `isCalendarDate` is the gate that decides whether a hand-edited or stale link is
 * honoured or dropped. It replaced a shape regex that accepted `2026-13-45` — a
 * value well-formed enough to pass every check on the way in, which then became an
 * Invalid Date in the range maths and a `NaN` in every average derived from it.
 *
 * The rule being pinned: shape AND resolvability. A string must be `YYYY-MM-DD` and
 * must parse back to itself, which rejects impossible fields and rolled-over dates
 * alike while accepting a genuine leap day.
 */
describe('isCalendarDate', () => {
  it('accepts real calendar dates', () => {
    expect(isCalendarDate('2026-01-01')).toBe(true);
    expect(isCalendarDate('2026-10-04')).toBe(true);
    expect(isCalendarDate('1999-12-31')).toBe(true);
    expect(isCalendarDate('2024-02-29')).toBe(true); // genuine leap day
  });

  it('rejects impossible fields that match the shape', () => {
    expect(isCalendarDate('2026-13-45')).toBe(false);
    expect(isCalendarDate('2026-00-10')).toBe(false);
    expect(isCalendarDate('2026-01-00')).toBe(false);
    expect(isCalendarDate('2026-01-32')).toBe(false);
  });

  it('rejects dates that only exist because the parser rolled them over', () => {
    // 31 February parses as 3 March; 29 February in a common year as 1 March.
    // A shape check cannot see either.
    expect(isCalendarDate('2026-02-31')).toBe(false);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2026-04-31')).toBe(false);
    expect(isCalendarDate('2026-06-31')).toBe(false);
  });

  it('rejects malformed shapes', () => {
    expect(isCalendarDate('not-a-date')).toBe(false);
    expect(isCalendarDate('2026-1-1')).toBe(false);
    expect(isCalendarDate('26-01-01')).toBe(false);
    expect(isCalendarDate('2026/01/01')).toBe(false);
    expect(isCalendarDate('2026-01-01T00:00:00Z')).toBe(false);
    expect(isCalendarDate('')).toBe(false);
  });

  it('rejects non-strings rather than coercing them', () => {
    // The signature accepts null/undefined because every caller has a nullable
    // query param; a number here is a caller bug, not a date.
    expect(isCalendarDate(null)).toBe(false);
    expect(isCalendarDate(undefined)).toBe(false);
    expect(isCalendarDate(20260101 as unknown as string)).toBe(false);
  });
});

/**
 * `calendarDaysBetween` is what the freshness chip counts elapsed days with, so its
 * behaviour at boundaries decides whether the chip says "1 day not scored" or
 * "31 days not scored".
 */
describe('calendarDaysBetween', () => {
  it('counts inclusive calendar days between labels', () => {
    expect(calendarDaysBetween('2026-01-01', '2026-01-01')).toBe(0);
    expect(calendarDaysBetween('2026-01-01', '2026-01-02')).toBe(1);
    expect(calendarDaysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(calendarDaysBetween('2026-01-01', '2026-02-01')).toBe(31);
  });

  it('crosses a year boundary', () => {
    expect(calendarDaysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(calendarDaysBetween('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('handles a leap year', () => {
    expect(calendarDaysBetween('2024-02-01', '2024-03-01')).toBe(29);
  });

  it('returns a negative span when the end precedes the start', () => {
    expect(calendarDaysBetween('2026-01-10', '2026-01-01')).toBe(-9);
  });

  it('returns 0 rather than NaN for unparseable labels', () => {
    // NaN would propagate into the chip's arithmetic and render "NaN days".
    expect(calendarDaysBetween('2026-13-45', '2026-01-31')).toBe(0);
  });
});

describe('shiftCalendarDay', () => {
  it('steps across month and year boundaries', () => {
    expect(shiftCalendarDay('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftCalendarDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftCalendarDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftCalendarDay('2024-03-01', -1)).toBe('2024-02-29');
  });
});
