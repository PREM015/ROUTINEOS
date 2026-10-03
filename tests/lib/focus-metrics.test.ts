import { describe, expect, it } from 'vitest';

import {
  FOCUS_METRIC_DEFAULTS,
  averageSessionMinutes,
  bucketByDay,
  completionRate,
  countedMinutes,
  countsTowardTotals,
  dailyProgress,
  isCompletedSession,
  isFocusSession,
  streakOfFocusDays,
  type FocusMetricRow,
} from '@/lib/focus/metrics';

/**
 * The glossary's entire reason for existing is that six consumers must agree.
 * These tests pin the *definitions*, not the implementation, so a refactor that
 * changes a number without changing a meaning is caught here.
 */

function row(overrides: Partial<FocusMetricRow> = {}): FocusMetricRow {
  return {
    id: 's1',
    type: 'FOCUS',
    startedAt: new Date('2026-03-10T09:00:00.000Z'),
    endedAt: new Date('2026-03-10T09:25:00.000Z'),
    endReason: 'COMPLETED',
    actualDuration: 25,
    timezone: 'UTC',
    ...overrides,
  };
}

describe('isFocusSession', () => {
  it('counts FOCUS and STOPWATCH as focus time', () => {
    expect(isFocusSession({ type: 'FOCUS' })).toBe(true);
    expect(isFocusSession({ type: 'STOPWATCH' })).toBe(true);
  });

  it('never counts a break', () => {
    // The original defect: every 5-minute break was added to every focus total in
    // the product, because nothing distinguished it from work.
    expect(isFocusSession({ type: 'SHORT_BREAK' })).toBe(false);
    expect(isFocusSession({ type: 'LONG_BREAK' })).toBe(false);
  });
});

describe('isCompletedSession', () => {
  it('keys on endReason, not on completedAt being set', () => {
    // Three cases that all set `completedAt` but mean different things. Testing
    // on the timestamp instead would make every one of them read as finished work.
    expect(isCompletedSession({ endReason: 'COMPLETED' })).toBe(true);
    expect(isCompletedSession({ endReason: 'MANUAL' })).toBe(false);
    expect(isCompletedSession({ endReason: 'AUTO_STALE' })).toBe(false);
    expect(isCompletedSession({ endReason: null })).toBe(false);
  });
});

describe('countsTowardTotals', () => {
  it('counts a completed session of any positive length', () => {
    expect(countsTowardTotals(row({ actualDuration: 1, endReason: 'COMPLETED' }))).toBe(true);
  });

  it('counts a partial at or above the floor', () => {
    expect(countsTowardTotals(row({ actualDuration: 22, endReason: 'STOPPED' }))).toBe(true);
    expect(countsTowardTotals(row({ actualDuration: 5, endReason: 'STOPPED' }))).toBe(true);
  });

  it('excludes a partial below the floor', () => {
    // Otherwise a streak could be manufactured by starting and stopping repeatedly.
    expect(countsTowardTotals(row({ actualDuration: 4, endReason: 'STOPPED' }))).toBe(false);
    expect(countsTowardTotals(row({ actualDuration: 0, endReason: 'STOPPED' }))).toBe(false);
  });

  it('honours a configured floor', () => {
    expect(countsTowardTotals(row({ actualDuration: 8, endReason: 'STOPPED' }), 10)).toBe(false);
    expect(countsTowardTotals(row({ actualDuration: 8, endReason: 'STOPPED' }), 5)).toBe(true);
  });

  it('never counts a break, whatever its length', () => {
    expect(
      countsTowardTotals(row({ type: 'SHORT_BREAK', actualDuration: 5, endReason: 'COMPLETED' }))
    ).toBe(false);
  });
});

describe('countedMinutes', () => {
  it('is zero for anything that does not count', () => {
    expect(countedMinutes(row({ type: 'LONG_BREAK' }))).toBe(0);
    expect(countedMinutes(row({ actualDuration: 2, endReason: 'STOPPED' }))).toBe(0);
  });

  it('agrees with countsTowardTotals, so totals cannot add up inconsistently', () => {
    const cases = [1, 4, 5, 25, 120];
    for (const minutes of cases) {
      const r = row({ actualDuration: minutes, endReason: minutes >= 5 ? 'COMPLETED' : 'STOPPED' });
      expect(countedMinutes(r) > 0).toBe(countsTowardTotals(r));
    }
  });

  it('never returns a negative figure', () => {
    expect(countedMinutes(row({ actualDuration: -10 }))).toBe(0);
  });
});

describe('bucketByDay', () => {
  it('buckets by the session snapshot zone, not the current one', () => {
    // 23:40 in Tokyo on the 10th is 14:40 UTC on the 10th. A user who has since
    // moved to Berlin must still see this session on the 10th.
    const buckets = bucketByDay({
      rows: [
        row({
          startedAt: new Date('2026-03-10T14:40:00.000Z'),
          endedAt: new Date('2026-03-10T15:00:00.000Z'),
          actualDuration: 20,
          timezone: 'Asia/Tokyo',
        }),
      ],
      timezone: 'Europe/Berlin',
      from: '2026-03-10',
      to: '2026-03-10',
    });
    expect(buckets.get('2026-03-10')?.minutes).toBe(20);
  });

  it('falls back to the current zone when a row has no snapshot', () => {
    const buckets = bucketByDay({
      rows: [row({ startedAt: new Date('2026-03-10T23:30:00.000Z'), endedAt: new Date('2026-03-10T23:55:00.000Z'), timezone: null })],
      timezone: 'UTC',
      from: '2026-03-10',
      to: '2026-03-10',
    });
    expect(buckets.get('2026-03-10')?.minutes).toBe(25);
  });

  it('splits minutes across midnight so the days sum to the total', () => {
    // 23:40 to 00:20 is 20 minutes on each side. Without the split the daily bar
    // chart and the streak disagree with lived experience.
    const buckets = bucketByDay({
      rows: [
        row({
          startedAt: new Date('2026-03-10T23:40:00.000Z'),
          endedAt: new Date('2026-03-11T00:20:00.000Z'),
          actualDuration: 40,
        }),
      ],
      timezone: 'UTC',
      from: '2026-03-10',
      to: '2026-03-11',
    });
    expect(buckets.get('2026-03-10')?.minutes).toBeCloseTo(20, 5);
    expect(buckets.get('2026-03-11')?.minutes).toBeCloseTo(20, 5);
    const sum = (buckets.get('2026-03-10')?.minutes ?? 0) + (buckets.get('2026-03-11')?.minutes ?? 0);
    expect(sum).toBeCloseTo(40, 5);
  });

  it('attributes the session counters to the start day only', () => {
    const buckets = bucketByDay({
      rows: [
        row({
          startedAt: new Date('2026-03-10T23:40:00.000Z'),
          endedAt: new Date('2026-03-11T00:20:00.000Z'),
          actualDuration: 40,
        }),
      ],
      timezone: 'UTC',
      from: '2026-03-10',
      to: '2026-03-11',
    });
    expect(buckets.get('2026-03-10')?.completedSessions).toBe(1);
    expect(buckets.get('2026-03-11')?.completedSessions).toBe(0);
  });

  it('creates no bucket for a break', () => {
    const buckets = bucketByDay({
      rows: [row({ type: 'SHORT_BREAK', actualDuration: 5 })],
      timezone: 'UTC',
      from: '2026-03-10',
      to: '2026-03-10',
    });
    expect(buckets.size).toBe(0);
  });
});

describe('streakOfFocusDays', () => {
  const threshold = FOCUS_METRIC_DEFAULTS.streakDayMinutes;

  function buckets(minutesByDate: Record<string, number>) {
    const map = new Map<string, { date: string; minutes: number; completedSessions: number; partialSessions: number }>();
    for (const [date, minutes] of Object.entries(minutesByDate)) {
      map.set(date, { date, minutes, completedSessions: 1, partialSessions: 0 });
    }
    return map;
  }

  it('counts consecutive qualifying days ending today', () => {
    expect(
      streakOfFocusDays(buckets({ '2026-03-10': 30, '2026-03-09': 40, '2026-03-08': 60 }), '2026-03-10', threshold)
    ).toBe(3);
  });

  it('does not break when today has not qualified yet', () => {
    // Penalising today before the day is over makes the number drop every morning
    // and recover at midnight, which reads as a bug to anyone watching it.
    expect(streakOfFocusDays(buckets({ '2026-03-09': 40, '2026-03-08': 60 }), '2026-03-10', threshold)).toBe(2);
  });

  it('breaks on a genuine gap', () => {
    expect(
      streakOfFocusDays(buckets({ '2026-03-10': 30, '2026-03-08': 60 }), '2026-03-10', threshold)
    ).toBe(1);
  });

  it('is zero when nothing qualifies', () => {
    expect(streakOfFocusDays(buckets({ '2026-03-08': 60 }), '2026-03-10', threshold)).toBe(0);
  });

  it('does not count a below-threshold day', () => {
    // A streak of "days where you opened the timer" is not a streak of anything.
    expect(streakOfFocusDays(buckets({ '2026-03-10': 10, '2026-03-09': 10 }), '2026-03-10', threshold)).toBe(0);
  });
});

describe('completionRate', () => {
  it('is null rather than 0 when there is nothing to judge', () => {
    // "You have not completed anything yet" and "you completed nothing" are
    // different facts, and rendering them the same way shows a new user a 0%.
    expect(completionRate([])).toBeNull();
    expect(completionRate([row({ actualDuration: 2, endReason: 'STOPPED' })])).toBeNull();
  });

  it('divides completed by started', () => {
    const rows = [
      row({ id: 'a', endReason: 'COMPLETED' }),
      row({ id: 'b', endReason: 'COMPLETED' }),
      row({ id: 'c', endReason: 'STOPPED' }),
      row({ id: 'd', endReason: 'STOPPED' }),
    ];
    expect(completionRate(rows)).toBeCloseTo(0.5, 5);
  });

  it('excludes sessions too short to have been completable', () => {
    const rows = [
      row({ id: 'a', endReason: 'COMPLETED' }),
      row({ id: 'b', actualDuration: 1, endReason: 'STOPPED' }),
    ];
    expect(completionRate(rows)).toBe(1);
  });

  it('does not count a MANUAL entry as a completed timebox', () => {
    expect(completionRate([row({ endReason: 'MANUAL' })])).toBe(0);
  });
});

describe('dailyProgress', () => {
  const map = new Map([['2026-03-10', { date: '2026-03-10', minutes: 150, completedSessions: 5, partialSessions: 1 }]]);

  it('clamps the fraction but reports the raw minutes', () => {
    const progress = dailyProgress(map, '2026-03-10', 120);
    expect(progress.fraction).toBe(1);
    expect(progress.minutes).toBe(150);
    expect(progress.reached).toBe(true);
  });

  it('falls back to the default target when given a nonsense one', () => {
    const progress = dailyProgress(map, '2026-03-10', 0);
    expect(progress.targetMinutes).toBe(FOCUS_METRIC_DEFAULTS.dailyTargetMinutes);
  });

  it('reports zero for a day with no sessions', () => {
    expect(dailyProgress(map, '2026-03-11', 120).minutes).toBe(0);
  });
});

describe('averageSessionMinutes', () => {
  it('averages only counted sessions', () => {
    const rows = [
      row({ id: 'a', actualDuration: 20, endReason: 'COMPLETED' }),
      row({ id: 'b', actualDuration: 40, endReason: 'COMPLETED' }),
      row({ id: 'c', actualDuration: 1, endReason: 'STOPPED' }),
    ];
    expect(averageSessionMinutes(rows)).toBe(30);
  });

  it('is zero when nothing counts', () => {
    expect(averageSessionMinutes([])).toBe(0);
  });
});
