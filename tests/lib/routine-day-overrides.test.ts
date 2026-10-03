import { describe, expect, it } from 'vitest';
import { partitionOverrides, relativeDayLabel } from '@/lib/routine/day-overrides';
import type { DayOverride } from '@/types/routine';

function row(date: string, overrides: Partial<DayOverride> = {}): DayOverride {
  return {
    date,
    dayTypeName: 'College',
    dayTypeColor: '#3b82f6',
    note: null,
    ...overrides,
  };
}

const TODAY = '2026-10-07'; // a Wednesday

describe('partitionOverrides', () => {
  it('splits on today, treating today as upcoming', () => {
    const list = partitionOverrides(
      [row('2026-10-05'), row('2026-10-07'), row('2026-10-09')],
      TODAY
    );

    expect(list.upcoming.map((r) => r.date)).toEqual(['2026-10-07', '2026-10-09']);
    expect(list.recent.map((r) => r.date)).toEqual(['2026-10-05']);
  });

  it('orders upcoming soonest-first and recent latest-first', () => {
    /*
     * The two sides want opposite orders, and getting either backwards produces a
     * list that looks plausible but buries the nearest date under the furthest.
     */
    const list = partitionOverrides(
      [
        row('2026-10-01'),
        row('2026-10-14'),
        row('2026-10-20'),
        row('2026-10-02'),
        row('2026-10-09'),
      ],
      TODAY
    );

    expect(list.upcoming.map((r) => r.date)).toEqual(['2026-10-09', '2026-10-14', '2026-10-20']);
    expect(list.recent.map((r) => r.date)).toEqual(['2026-10-02', '2026-10-01']);
  });

  it('caps each side but still reports the full history count', () => {
    // Six past, six future, so both sides actually overflow their cap.
    const many = [
      ...Array.from({ length: 6 }, (_, i) => row(`2026-09-${String(i + 1).padStart(2, '0')}`)),
      ...Array.from({ length: 6 }, (_, i) => row(`2026-10-${String(i + 8).padStart(2, '0')}`)),
    ];

    const list = partitionOverrides(many, TODAY, 3);

    expect(list.upcoming).toHaveLength(3);
    expect(list.recent).toHaveLength(3);
    // The count is the whole truth, so the card can say "12 total" honestly.
    expect(list.totalCount).toBe(12);
  });

  it('leaves the other side empty when every override is in the past', () => {
    const past = Array.from({ length: 5 }, (_, i) => row(`2026-09-${String(i + 1).padStart(2, '0')}`));

    const list = partitionOverrides(past, TODAY, 3);

    expect(list.upcoming).toEqual([]);
    expect(list.recent).toHaveLength(3);
  });

  it('keeps the nearest rows when capping', () => {
    const many = [
      row('2026-09-01'),
      row('2026-09-20'),
      row('2026-09-25'),
      row('2026-09-30'),
    ];

    const list = partitionOverrides(many, TODAY, 2);

    // Most recent two, not the first two encountered.
    expect(list.recent.map((r) => r.date)).toEqual(['2026-09-30', '2026-09-25']);
  });

  it('handles input arriving in any order', () => {
    // The repository orders by `date: 'desc'`, but the split must not depend on it.
    const shuffled = [row('2026-10-12'), row('2026-09-30'), row('2026-10-03'), row('2026-10-09')];

    const list = partitionOverrides(shuffled, TODAY);

    expect(list.upcoming.map((r) => r.date)).toEqual(['2026-10-09', '2026-10-12']);
    // Latest-first, like the other recent-order tests.
    expect(list.recent.map((r) => r.date)).toEqual(['2026-10-03', '2026-09-30']);
  });

  it('returns both sides empty for null or empty input', () => {
    expect(partitionOverrides(null, TODAY)).toEqual({ upcoming: [], recent: [], totalCount: 0 });
    expect(partitionOverrides([], TODAY)).toEqual({ upcoming: [], recent: [], totalCount: 0 });
  });

  it('does not treat a zero limit as "no limit"', () => {
    const list = partitionOverrides([row('2026-10-09'), row('2026-10-01')], TODAY, 0);

    expect(list.upcoming).toEqual([]);
    expect(list.recent).toEqual([]);
    expect(list.totalCount).toBe(2);
  });
});

describe('relativeDayLabel', () => {
  it('labels today and its neighbours in calendar days, not hours', () => {
    /*
     * The bug this guards: computing from a timestamp difference makes a date
     * read as "2 days ago" at 11pm the evening after it, because 26 hours have
     * passed. Both labels below are calendar-day answers.
     */
    expect(relativeDayLabel('2026-10-07', TODAY)).toBe('today');
    expect(relativeDayLabel('2026-10-06', TODAY)).toBe('yesterday');
    expect(relativeDayLabel('2026-10-08', TODAY)).toBe('tomorrow');
    expect(relativeDayLabel('2026-10-05', TODAY)).toBe('2 days ago');
    expect(relativeDayLabel('2026-10-09', TODAY)).toBe('in 2 days');
  });

  it('switches to weeks past a week', () => {
    expect(relativeDayLabel('2026-10-14', TODAY)).toBe('in a week');
    expect(relativeDayLabel('2026-10-21', TODAY)).toBe('in 2 weeks');
    expect(relativeDayLabel('2026-09-30', TODAY)).toBe('a week ago');
    expect(relativeDayLabel('2026-09-23', TODAY)).toBe('2 weeks ago');
  });

  it('crosses month and year boundaries', () => {
    // 31 days out. 31/7 = 4.43, which rounds to 4 — "in 4 weeks" rather than a
    // month, because a rounded week count is honest at every distance while
    // "a month" would be wrong for anything from 29 to 45 days.
    expect(relativeDayLabel('2026-11-07', TODAY)).toBe('in 4 weeks');
    // Oct 7 -> Dec 31 is 85 days = 12.14 weeks.
    expect(relativeDayLabel('2026-12-31', TODAY)).toBe('in 12 weeks');
    // 2025-12-31 -> 2026-10-07 is exactly 280 days = 40 weeks.
    expect(relativeDayLabel('2025-12-31', TODAY)).toBe('40 weeks ago');
  });

  it('is not shifted by the host timezone', () => {
    // Days-since-epoch on both sides, so no local `Date` midnight is involved.
    expect(relativeDayLabel('2026-01-01', '2025-12-31')).toBe('tomorrow');
    expect(relativeDayLabel('2025-12-31', '2026-01-01')).toBe('yesterday');
  });

  it('returns the raw date rather than guessing on a malformed one', () => {
    expect(relativeDayLabel('not-a-date', TODAY)).toBe('not-a-date');
    expect(relativeDayLabel('2026-13-45', TODAY)).toBe('2026-13-45');
  });
});
