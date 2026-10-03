import { describe, expect, it } from 'vitest';

import { attributeMinutes, dayTotals, labelFor } from '@/lib/focus/day-split';
import type { FocusStatsRow } from '@/lib/focus/stats';
import type { FocusSessionType } from '@/constants/prisma-enums';

/**
 * Daily attribution is the difference between "the numbers match what I
 * experienced" and "the numbers are technically correct".
 *
 * A session from 23:40 to 00:20 is 20 minutes on each side. Without the split,
 * one day gets a 40-minute spike and the other gets nothing, and the streak — which
 * is the number people actually notice — disagrees with their own experience.
 */

function row(overrides: Partial<FocusStatsRow> = {}): FocusStatsRow {
  return {
    id: 's1',
    type: 'FOCUS',
    startedAt: new Date('2026-03-10T09:00:00.000Z'),
    completedAt: new Date('2026-03-10T09:25:00.000Z'),
    abortedAt: null,
    actualDuration: 25,
    endReason: 'COMPLETED',
    timezone: 'UTC',
    ...overrides,
  };
}

describe('labelFor', () => {
  it('buckets in the given zone, not in UTC', () => {
    // 22:00 UTC on the 10th is 07:00 on the 11th in Tokyo. UTC bucketing would put
    // a Tokyo user's morning session on the previous day.
    const instant = new Date('2026-03-10T22:00:00.000Z');
    expect(labelFor(instant, 'UTC')).toBe('2026-03-10');
    expect(labelFor(instant, 'Asia/Tokyo')).toBe('2026-03-11');
  });

  it('falls back to UTC on an invalid zone rather than throwing', () => {
    // A user's settings can carry a zone this runtime has never heard of; a stats
    // endpoint must not 500 because of it.
    expect(labelFor(new Date('2026-03-10T09:00:00.000Z'), 'Not/AZone')).toBe('2026-03-10');
  });
});

describe('attributeMinutes', () => {
  it('returns nothing for a zero-length session', () => {
    expect(
      attributeMinutes({ startedAt: new Date('2026-03-10T09:00:00.000Z'), endedAt: null, actualMinutes: 0, timezone: 'UTC' })
    ).toEqual([]);
  });

  it('keeps a session inside one day on that day', () => {
    const parts = attributeMinutes({
      startedAt: new Date('2026-03-10T09:00:00.000Z'),
      endedAt: new Date('2026-03-10T09:25:00.000Z'),
      actualMinutes: 25,
      timezone: 'UTC',
    });
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ date: '2026-03-10', minutes: 25, isStartDay: true });
  });

  it('splits across midnight and marks only the start day', () => {
    const parts = attributeMinutes({
      startedAt: new Date('2026-03-10T23:40:00.000Z'),
      endedAt: new Date('2026-03-11T00:20:00.000Z'),
      actualMinutes: 40,
      timezone: 'UTC',
    });
    expect(parts.map((p) => p.date)).toEqual(['2026-03-10', '2026-03-11']);
    expect(parts.filter((p) => p.isStartDay)).toHaveLength(1);
    expect(parts[0]?.isStartDay).toBe(true);
  });

  it('always sums back to the authoritative duration', () => {
    // Pro-rata in floating point leaves a fraction somewhere; the split must sum to
    // the stored `actualMinutes` exactly, or the days will not add up to the total.
    for (const [start, end, minutes] of [
      ['2026-03-10T23:59:30.000Z', '2026-03-11T00:00:30.000Z', 1],
      ['2026-03-10T22:00:00.000Z', '2026-03-11T03:00:00.000Z', 300],
      ['2026-03-10T00:10:00.000Z', '2026-03-12T23:50:00.000Z', 2870],
    ] as const) {
      const parts = attributeMinutes({
        startedAt: new Date(start),
        endedAt: new Date(end),
        actualMinutes: minutes,
        timezone: 'UTC',
      });
      const sum = parts.reduce((acc, p) => acc + p.minutes, 0);
      expect(sum).toBeCloseTo(minutes, 6);
    }
  });

  it('splits at the session zone midnight, not at UTC midnight', () => {
    // 14:50–15:10 UTC is 23:50–00:10 in Tokyo, so it crosses *Tokyo's* midnight.
    // Bucketing on UTC would have called this a single 20-minute session on the
    // 10th; in the user's own zone it is 10 minutes either side of their midnight.
    const parts = attributeMinutes({
      startedAt: new Date('2026-03-10T14:50:00.000Z'),
      endedAt: new Date('2026-03-10T15:10:00.000Z'),
      actualMinutes: 20,
      timezone: 'Asia/Tokyo',
    });
    expect(parts.map((p) => p.date)).toEqual(['2026-03-10', '2026-03-11']);
    expect(parts[0]?.minutes).toBeCloseTo(10, 5);
    expect(parts[1]?.minutes).toBeCloseTo(10, 5);
  });

  it('does not split a session that is inside one day in the session zone', () => {
    // 00:30–01:00 UTC on the 10th is 09:30–10:00 in Tokyo — one day, even though
    // it is near UTC's own midnight.
    const parts = attributeMinutes({
      startedAt: new Date('2026-03-10T00:30:00.000Z'),
      endedAt: new Date('2026-03-10T01:00:00.000Z'),
      actualMinutes: 30,
      timezone: 'Asia/Tokyo',
    });
    expect(parts).toHaveLength(1);
    expect(parts[0]?.date).toBe('2026-03-10');
  });

  it('derives an end from the duration when the session is still open', () => {
    const parts = attributeMinutes({
      startedAt: new Date('2026-03-10T23:30:00.000Z'),
      endedAt: null,
      actualMinutes: 60,
      timezone: 'UTC',
    });
    expect(parts.map((p) => p.date)).toEqual(['2026-03-10', '2026-03-11']);
  });

  it('cannot spin on a corrupt far-future end', () => {
    // A client claiming it ran for 300 years must not hang the endpoint.
    const parts = attributeMinutes({
      startedAt: new Date('2026-03-10T09:00:00.000Z'),
      endedAt: new Date('2326-03-10T09:00:00.000Z'),
      actualMinutes: 25,
      timezone: 'UTC',
    });
    expect(parts.length).toBeLessThanOrEqual(40);
  });
});

describe('dayTotals', () => {
  it('sums counted minutes per day', () => {
    const totals = dayTotals(
      [
        row({ id: 'a', startedAt: new Date('2026-03-10T09:00:00.000Z'), completedAt: new Date('2026-03-10T09:25:00.000Z') }),
        row({ id: 'b', startedAt: new Date('2026-03-10T11:00:00.000Z'), completedAt: new Date('2026-03-10T11:45:00.000Z'), actualDuration: 45 }),
      ],
      { timezone: 'UTC', from: '2026-03-10', to: '2026-03-10' }
    );
    expect(totals.get('2026-03-10')).toBeCloseTo(70, 5);
  });

  it('ignores breaks', () => {
    const totals = dayTotals([row({ type: 'SHORT_BREAK' as FocusSessionType, actualDuration: 5 })], {
      timezone: 'UTC',
      from: '2026-03-10',
      to: '2026-03-10',
    });
    expect(totals.size).toBe(0);
  });

  it('respects the requested range', () => {
    const totals = dayTotals([row()], { timezone: 'UTC', from: '2026-04-01', to: '2026-04-30' });
    expect(totals.size).toBe(0);
  });

  it('prefers the session snapshot over the current zone', () => {
    // Without this, moving timezone would silently re-bucket all of history.
    const totals = dayTotals(
      [row({ startedAt: new Date('2026-03-10T14:40:00.000Z'), completedAt: new Date('2026-03-10T15:00:00.000Z'), actualDuration: 20, timezone: 'Asia/Tokyo' })],
      { timezone: 'Europe/Berlin', from: '2026-03-10', to: '2026-03-11' }
    );
    expect(totals.get('2026-03-10')).toBeCloseTo(20, 5);
  });
});
