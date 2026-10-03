import { describe, expect, it } from 'vitest';
import {
  intervalsFor,
  overlapMinutes,
  routineBlocksConflict,
  timesConflict,
  minutesToTime,
  timeToMinutesExact,
} from '@/lib/routine/conflicts';
import {
  calculateBlockDuration,
  calculateBlockProgress,
  formatClockMinutes,
  formatDuration,
  getCurrentBlock,
  getNextBlock,
  isOvernightBlock,
  isTimeOverlap,
  minutesUntilBlock,
} from '@/lib/routine/duration';

/**
 * `lib/routine/conflicts` is the single overlap implementation; `duration.ts`
 * delegates to it. These tests pin the overnight behaviour that the previous
 * inline comparison in `duration.ts` got wrong, because that is the whole reason
 * the module was promoted.
 */
describe('conflicts: overnight expansion', () => {
  it('finds the overlap the naive comparison missed', () => {
    // 22:00 -> 06:00 occupies [1320,1440) + [0,360).
    // 01:00 -> 02:00 sits inside [0,360), so these DO clash.
    expect(routineBlocksConflict(
      { startTime: '22:00', endTime: '06:00' },
      { startTime: '01:00', endTime: '02:00' }
    )).toBe(true);

    // This is the exact case the old `duration.ts` arithmetic got wrong: it
    // rolled the overnight end to 1620 and compared that against 60..120, so it
    // reported "no overlap" for a block that is entirely inside the sleep.
    expect(overlapMinutes(
      { startTime: '22:00', endTime: '06:00' },
      { startTime: '01:00', endTime: '02:00' }
    )).toBe(60);
  });

  it('does not report an overnight block overlapping ordinary daytime work', () => {
    expect(routineBlocksConflict(
      { startTime: '22:00', endTime: '06:00' },
      { startTime: '09:00', endTime: '17:00' }
    )).toBe(false);
  });

  it('measures the shared portion of two overlapping daytime blocks', () => {
    expect(overlapMinutes(
      { startTime: '09:00', endTime: '11:00' },
      { startTime: '10:00', endTime: '12:00' }
    )).toBe(60);
  });

  it('measures an overnight block against an overlapping evening block', () => {
    // 23:00 -> 00:30 lives in [1380,1440) of the overnight block's expansion.
    expect(overlapMinutes(
      { startTime: '22:00', endTime: '06:00' },
      { startTime: '23:00', endTime: '00:30' }
    )).toBe(90);
  });

  it('treats identical start and end as a full 24 hours, not zero', () => {
    expect(intervalsFor({ startTime: '22:00', endTime: '22:00' })).toEqual([[0, 1440]]);
    expect(overlapMinutes(
      { startTime: '08:00', endTime: '08:00' },
      { startTime: '09:00', endTime: '10:00' }
    )).toBe(60);
  });

  it('never reports more than one day of overlap for fully nested blocks', () => {
    expect(overlapMinutes(
      { startTime: '22:00', endTime: '06:00' },
      { startTime: '23:00', endTime: '05:00' }
    )).toBe(360);
  });

  it('is symmetric', () => {
    const left = { startTime: '10:00', endTime: '13:00' };
    const right = { startTime: '12:00', endTime: '14:00' };
    expect(overlapMinutes(left, right)).toBe(overlapMinutes(right, left));
  });

  it('never conflicts a block with itself', () => {
    expect(routineBlocksConflict(
      { id: 'a', startTime: '09:00', endTime: '10:00' },
      { id: 'a', startTime: '09:00', endTime: '10:00' }
    )).toBe(false);
  });

  it('does not conflict two blocks that merely touch end-to-end', () => {
    expect(routineBlocksConflict(
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '10:00', endTime: '11:00' }
    )).toBe(false);
  });
});

describe('conflicts: strict parsing', () => {
  it('rejects malformed times instead of reading them as NaN or 9am', () => {
    expect(() => timeToMinutesExact('9am')).toThrow(/HH:mm/);
    expect(() => timeToMinutesExact('12:60')).toThrow(/HH:mm/);
    expect(() => timeToMinutesExact('24:00')).toThrow(/HH:mm/);
    expect(() => timeToMinutesExact('')).toThrow(/HH:mm/);
  });

  it('round-trips minutes through HH:mm', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(9 * 60 + 5)).toBe('09:05');
    expect(minutesToTime(1439)).toBe('23:59');
    // Wraps rather than producing "24:00".
    expect(minutesToTime(1440)).toBe('00:00');
    expect(minutesToTime(-1)).toBe('23:59');
  });
});

describe('duration: isTimeOverlap delegates to the canonical check', () => {
  it('agrees with timesConflict, including past midnight', () => {
    expect(isTimeOverlap('09:00', '11:00', '10:00', '12:00')).toBe(true);
    expect(isTimeOverlap('09:00', '11:00', '11:00', '12:00')).toBe(false);
    expect(timesConflict('22:00', '06:00', '01:00', '02:00')).toBe(
      isTimeOverlap('22:00', '06:00', '01:00', '02:00')
    );
  });
});

describe('duration: overnight', () => {
  it('classifies end <= start as overnight', () => {
    expect(isOvernightBlock('22:00', '06:00')).toBe(true);
    expect(isOvernightBlock('22:00', '22:00')).toBe(true);
    expect(isOvernightBlock('06:00', '22:00')).toBe(false);
  });

  it('reports an overnight duration as a positive number', () => {
    expect(calculateBlockDuration('22:00', '06:00')).toBe(480);
    expect(calculateBlockDuration('23:30', '00:30')).toBe(60);
    expect(calculateBlockDuration('09:00', '10:30')).toBe(90);
    // Same time in and out reads as "all day", not zero.
    expect(calculateBlockDuration('08:00', '08:00')).toBe(1440);
  });
});

describe('duration: clock formatting respects timeFormat', () => {
  it('renders 24h by default', () => {
    expect(formatClockMinutes(0)).toBe('00:00');
    expect(formatClockMinutes(13 * 60 + 45)).toBe('13:45');
  });

  it('renders 12h when asked', () => {
    expect(formatClockMinutes(0, false)).toBe('12:00 AM');
    expect(formatClockMinutes(9 * 60 + 5, false)).toBe('9:05 AM');
    expect(formatClockMinutes(12 * 60, false)).toBe('12:00 PM');
    expect(formatClockMinutes(13 * 60 + 45, false)).toBe('1:45 PM');
    expect(formatClockMinutes(23 * 60 + 59, false)).toBe('11:59 PM');
  });
});

describe('duration: formatDuration', () => {
  it('drops empty units', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(90)).toBe('1h 30m');
    expect(formatDuration(480)).toBe('8h');
  });
});

describe('duration: progress through an overnight block', () => {
  it('counts past midnight instead of going negative', () => {
    // 01:00 is 180 minutes into a 22:00 -> 06:00 block.
    const progress = calculateBlockProgress('22:00', '06:00', '01:00');
    expect(progress.minutesElapsed).toBe(180);
    expect(progress.minutesRemaining).toBe(300);
    expect(progress.percentage).toBe(38);
  });

  it('reads zero before the block starts', () => {
    const progress = calculateBlockProgress('09:00', '10:00', '08:00');
    expect(progress.minutesElapsed).toBe(0);
    expect(progress.percentage).toBe(0);
  });

  it('clamps to the full duration after the block ends', () => {
    const progress = calculateBlockProgress('09:00', '10:00', '18:00');
    expect(progress.percentage).toBe(100);
    expect(progress.minutesRemaining).toBe(0);
  });
});

describe('getCurrentBlock with overnight blocks', () => {
  const blocks = [
    { id: 'work', startTime: '09:00', endTime: '17:00' },
    { id: 'sleep', startTime: '22:00', endTime: '06:00' },
  ];

  it('finds a daytime block', () => {
    expect(getCurrentBlock(blocks, '13:00')?.id).toBe('work');
  });

  it('finds an overnight block in the small hours', () => {
    expect(getCurrentBlock(blocks, '01:00')?.id).toBe('sleep');
    expect(getCurrentBlock(blocks, '05:30')?.id).toBe('sleep');
  });

  it('finds an overnight block in the evening', () => {
    expect(getCurrentBlock(blocks, '23:00')?.id).toBe('sleep');
  });

  it('returns null in a genuine gap', () => {
    expect(getCurrentBlock(blocks, '18:00')).toBeNull();
  });
});

describe('minutesUntilBlock', () => {
  it('counts forward and wraps past midnight', () => {
    expect(minutesUntilBlock('09:00', '08:00')).toBe(60);
    expect(minutesUntilBlock('01:00', '23:00')).toBe(120);
    expect(minutesUntilBlock('09:00', '09:00')).toBe(0);
  });
});

describe('getNextBlock', () => {
  const blocks = [
    { id: 'a', startTime: '06:00', endTime: '07:00' },
    { id: 'b', startTime: '09:00', endTime: '11:00' },
    { id: 'c', startTime: '14:00', endTime: '15:00' },
  ];

  it('returns the soonest block that has not started', () => {
    expect(getNextBlock(blocks, '07:30')?.id).toBe('b');
    expect(getNextBlock(blocks, '04:00')?.id).toBe('a');
  });

  it('returns null when the day is over rather than the earliest block', () => {
    expect(getNextBlock(blocks, '14:30')).toBeNull();
    expect(getNextBlock(blocks, '15:00')).toBeNull();
  });
});