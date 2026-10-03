import { describe, expect, it } from 'vitest';
import { getNextBlock, getCurrentBlock } from '@/lib/routine/duration';

/**
 * Guards the F7 fix in `getNextBlock`.
 *
 * The old implementation fell back to `sortedBlocks[0]` â€” the day's *earliest*
 * block, already finished â€” under a comment claiming it was "the first block of
 * tomorrow". The dashboard then rendered "Next: 06:00 block at 06:00" while the
 * user was inside a later block with nothing scheduled after it.
 *
 * Both real consumers (`/today`'s `CurrentRoutineBlock` and `/dashboard`'s
 * `RightNow`) render a "last block of the day" message when this returns `null`,
 * so `null` is the honest answer and these tests pin that.
 */
describe('getNextBlock', () => {
  const blocks = [
    { id: 'a', startTime: '06:00', endTime: '07:00' },
    { id: 'b', startTime: '09:00', endTime: '11:00' },
    { id: 'c', startTime: '14:00', endTime: '15:00' },
  ];

  it('returns the next block that starts later', () => {
    expect(getNextBlock(blocks, '07:30')?.id).toBe('b');
    expect(getNextBlock(blocks, '11:30')?.id).toBe('c');
  });

  it('returns the first block when nothing has started yet', () => {
    expect(getNextBlock(blocks, '04:00')?.id).toBe('a');
  });

  it('returns null when nothing starts later â€” not the earliest block', () => {
    // 14:00 is current; nothing starts after it. The old fallback returned 'a'
    // (06:00), which had already finished.
    expect(getNextBlock(blocks, '14:30')).toBeNull();
  });

  it('returns null when the last block is current', () => {
    expect(getNextBlock(blocks, '15:00')).toBeNull();
  });

  it('treats an exact start time as already started, so it is not "next"', () => {
    expect(getNextBlock(blocks, '09:00')?.id).toBe('c');
  });

  it('handles midnight and end-of-day correctly', () => {
    expect(getNextBlock(blocks, '23:59')).toBeNull();
    // A 00:00 block is "already started" at 23:00 â€” it began 23 hours ago.
    // This is correct, and is the case the old fallback got wrong in the other
    // direction by surfacing a finished block as next.
    expect(getNextBlock([{ id: 'n', startTime: '00:00', endTime: '01:00' }], '23:00')).toBeNull();
    // A 00:00 block is never "next" within the same day — it has always already
    // started. There is no clock time at which 00:00 is still ahead of you.
    expect(getNextBlock([{ id: 'n', startTime: '00:00', endTime: '01:00' }], '00:01')).toBeNull();
  });

  it('handles a single block', () => {
    expect(getNextBlock([{ id: 'only', startTime: '10:00', endTime: '11:00' }], '12:00')).toBeNull();
    expect(getNextBlock([{ id: 'only', startTime: '10:00', endTime: '11:00' }], '09:00')?.id).toBe('only');
  });

  it('returns null for an empty schedule rather than throwing', () => {
    expect(getNextBlock([], '10:00')).toBeNull();
  });

  it('does not mutate its input', () => {
    const input = [...blocks];
    getNextBlock(input, '07:30');
    expect(input.map((b) => b.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('getCurrentBlock', () => {
  const blocks = [
    { id: 'a', startTime: '06:00', endTime: '07:00' },
    { id: 'b', startTime: '09:00', endTime: '11:00' },
  ];

  it('identifies the block containing the current time', () => {
    expect(getCurrentBlock(blocks, '09:30')?.id).toBe('b');
  });

  it('returns null between blocks', () => {
    expect(getCurrentBlock(blocks, '08:00')).toBeNull();
  });
});