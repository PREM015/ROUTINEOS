import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  summarizeDay,
  getNowNext,
  phaseOf,
  sortBlocks,
  findConflictMap,
  blockEndMinutes,
  buildGanttLayout,
  type TimelineBlock,
} from '@/lib/routine/timeline';
import type { ResolvedRoutineBlock, ResolvedBlockLog } from '@/types/routine';

/**
 * `/routine`'s whole timeline is derived by these three functions. They take
 * blocks and one clock reading and are the only place the page decides what
 * order things are in, what is running, what is free and what clashes — so
 * every rule the UI depends on is pinned here.
 */

function block(
  id: string,
  startTime: string,
  endTime: string,
  extra: Partial<ResolvedRoutineBlock> = {}
): ResolvedRoutineBlock {
  return {
    id,
    startTime,
    endTime,
    title: id,
    description: null,
    notes: null,
    color: null,
    icon: null,
    category: null,
    categoryId: null,
    energyLevel: null,
    trackCompletion: true,
    durationMinutes: 0,
    isOvernight: false,
    log: null,
    ...extra,
  };
}

/**
 * Every test that asserts TIME geometry has to opt out of stack mode.
 *
 * `DEFAULT_GANTT` ships `uniformRowHeight: 96`, so the default layout is a
 * uniform list: every block is 96px tall regardless of duration, and `top` is row
 * order rather than the clock. That is what the product renders, and it is
 * deliberate.
 *
 * 96 is derived rather than chosen. The card is asked to carry `p-4` of internal
 * padding (32px) around three rows separated by `gap-2` (64px): 32 + 64 = 96. An
 * earlier 80 was correct only for the old `py-2.5` / `mt-1` layout, and stopped
 * being correct the moment the padding and row gap were raised.
 *
 * The engine still supports time mode, and this suite pins it - the height floor,
 * duration scaling, the exact ratio, clock positioning, gaps. But `minRowHeight`,
 * `pxPerMinute` and `uniformRowHeight` are read from the merged config BEFORE any
 * assertion runs, so a time-mode test that forgets to override them silently
 * measures stack mode instead and fails with a confusing number.
 *
 * Hence this constant: one name, in one place, on every time-mode test.
 */
const TIME_MODE = { uniformRowHeight: null, pxPerMinute: 3, minRowHeight: 88 } as const;

/** Time mode with a caller-supplied override, for tests pinning one axis. */
function timeMode<T extends Record<string, unknown>>(overrides: T) {
  return { ...TIME_MODE, ...overrides };
}

function log(status: ResolvedBlockLog['status']): ResolvedBlockLog {
  return {
    id: `log-${status}`,
    status,
    actualStartTime: null,
    actualEndTime: null,
    durationMinutes: null,
    focusRating: null,
    productivityRating: null,
    energyLevel: null,
    note: null,
  };
}

function blockItems(items: ReturnType<typeof buildTimeline>): TimelineBlock[] {
  return items.filter((item): item is TimelineBlock => item.kind === 'BLOCK');
}

// ============================================================================

describe('sortBlocks orders by start time, not sortOrder', () => {
  it('sorts by time even when sortOrder disagrees', () => {
    const blocks = [
      block('late', '14:00', '15:00', { sortOrder: 0 }),
      block('early', '06:00', '07:00', { sortOrder: 99 }),
    ];
    expect(sortBlocks(blocks).map((b) => b.id)).toEqual(['early', 'late']);
  });

  it('uses sortOrder only as a tiebreak for identical start times', () => {
    const blocks = [
      block('second', '09:00', '10:00', { sortOrder: 2 }),
      block('first', '09:00', '10:00', { sortOrder: 1 }),
    ];
    expect(sortBlocks(blocks).map((b) => b.id)).toEqual(['first', 'second']);
  });

  it('falls back to title so the order is total and stable', () => {
    const blocks = [
      block('z', '09:00', '10:00', { sortOrder: 0, title: 'Zebra' }),
      block('a', '09:00', '10:00', { sortOrder: 0, title: 'Apple' }),
    ];
    expect(sortBlocks(blocks).map((b) => b.title)).toEqual(['Apple', 'Zebra']);
  });

  it('does not mutate its input', () => {
    const blocks = [
      block('late', '14:00', '15:00'),
      block('early', '06:00', '07:00'),
    ];
    sortBlocks(blocks);
    expect(blocks.map((b) => b.id)).toEqual(['late', 'early']);
  });
});

// ============================================================================

describe('blockEndMinutes pushes an overnight end past midnight', () => {
  it('leaves a daytime block alone', () => {
    expect(blockEndMinutes('09:00', '10:30')).toBe(630);
  });

  it('rolls an overnight end forward', () => {
    expect(blockEndMinutes('22:00', '06:00')).toBe(1800);
    expect(blockEndMinutes('23:30', '00:30')).toBe(1470);
  });

  it('anchors a full-day block past midnight', () => {
    // Equal times read as "all day": a block anchored at 08:00 runs to 08:00 the
    // next day, so its frame end is 1920 while its start is 480. The *duration*
    // is the difference — the 1440 the UI shows — not the frame end.
    expect(blockEndMinutes('08:00', '08:00')).toBe(1920);

    const only = blockItems(buildTimeline([block('allday', '08:00', '08:00')], null))[0];
    expect(only?.startMinutes).toBe(480);
    expect(only?.endMinutes).toBe(1920);
    expect(only?.durationMinutes).toBe(1440);
  });
});

// ============================================================================

describe('phaseOf', () => {
  it('treats every block as UPCOMING when there is no clock', () => {
    // A past or future date has no "now". Rendering those blocks as PAST would
    // dim a future plan as though it had already been missed.
    expect(phaseOf('09:00', '10:00', null)).toBe('UPCOMING');
  });

  it('classifies PAST / CURRENT / UPCOMING for daytime blocks', () => {
    expect(phaseOf('09:00', '10:00', 11 * 60)).toBe('PAST');
    expect(phaseOf('09:00', '10:00', 9 * 60 + 30)).toBe('CURRENT');
    expect(phaseOf('09:00', '10:00', 8 * 60)).toBe('UPCOMING');
  });

  it('finds an overnight block in the small hours, wrapping past midnight', () => {
    expect(phaseOf('22:00', '06:00', 60)).toBe('CURRENT');
    expect(phaseOf('22:00', '06:00', 5 * 60 + 30)).toBe('CURRENT');
    expect(phaseOf('22:00', '06:00', 23 * 60)).toBe('CURRENT');
  });

  it('keeps an overnight block UPCOMING before its start, including after its end', () => {
    // A recurring daily template: at 07:00 tonight's Sleep has not happened
    // yet. Whether last night's did is answered by the log, not the clock.
    expect(phaseOf('22:00', '06:00', 7 * 60)).toBe('UPCOMING');
    expect(phaseOf('22:00', '06:00', 20 * 60)).toBe('UPCOMING');
  });

  it('uses a half-open interval, so a block is over at its exact end time', () => {
    expect(phaseOf('09:00', '10:00', 9 * 60 + 59)).toBe('CURRENT');
    expect(phaseOf('09:00', '10:00', 10 * 60)).toBe('PAST');
  });
});

// ============================================================================

describe('buildTimeline', () => {
  it('returns nothing for an empty day', () => {
    expect(buildTimeline([], 600)).toEqual([]);
  });

  it('orders blocks by start time and keys them by block id', () => {
    const items = buildTimeline(
      [block('afternoon', '14:00', '15:00'), block('morning', '09:00', '10:00')],
      null
    );
    expect(blockItems(items).map((i) => i.key)).toEqual(['morning', 'afternoon']);
  });

  it('inserts a gap between blocks and exposes its minutes', () => {
    const items = buildTimeline(
      [block('a', '09:00', '10:00'), block('b', '10:35', '11:00')],
      null
    );
    const gap = items.find((item) => item.kind === 'GAP');
    expect(gap).toBeDefined();
    expect(gap).toMatchObject({
      kind: 'GAP',
      startMinutes: 600,
      endMinutes: 635,
      minutes: 35,
      wrapsMidnight: false,
    });
  });

  it('does not insert a gap shorter than the minimum', () => {
    const items = buildTimeline(
      [block('a', '09:00', '10:00'), block('b', '10:02', '11:00')],
      null
    );
    expect(items.filter((item) => item.kind === 'GAP')).toHaveLength(0);
  });

  it('does not draw anything before the first or after the last block', () => {
    const items = buildTimeline([block('only', '09:00', '10:00')], null);
    expect(items).toHaveLength(1);
    expect(items.every((item) => item.kind === 'BLOCK')).toBe(true);
  });

  it('puts the gap on the block that follows it, not on the first block', () => {
    const items = buildTimeline(
      [block('a', '09:00', '10:00'), block('b', '11:00', '12:00')],
      null
    );
    const [first, second] = blockItems(items);
    expect(first?.gapBefore).toBeNull();
    expect(second?.gapBefore?.minutes).toBe(60);
  });

  it('does not offer a gap after a full-day block', () => {
    // A block anchored at 08:00 that ends at 08:00 covers the whole calendar
    // day, so the 09:00 block after it has no free space before it. Rendering a
    // negative gap here would offer to "add a block" into time that is taken.
    const items = buildTimeline(
      [block('allday', '08:00', '08:00'), block('later', '09:00', '10:00')],
      null
    );
    expect(items.filter((item) => item.kind === 'GAP')).toHaveLength(0);
  });

  it('offers the free time before an overnight block', () => {
    // Sleep is anchored at 22:00 and runs into tomorrow, but the 08:00-22:00
    // stretch before it really is free, and is the most useful place on this
    // rail to offer to add a block.
    const items = blockItems(
      buildTimeline([block('morning', '07:00', '08:00'), block('sleep', '22:00', '06:00')], null)
    );
    expect(items[1]?.gapBefore?.minutes).toBe(840);
  });

  it('honours a custom minimum gap', () => {
    const blocks = [block('a', '09:00', '10:00'), block('b', '10:02', '11:00')];
    // A 2-minute seam is below the 5-minute default and is not worth rendering.
    expect(buildTimeline(blocks, null).filter((i) => i.kind === 'GAP')).toHaveLength(0);
    // Lowering the minimum to 2 makes the same seam render.
    expect(
      buildTimeline(blocks, null, { minGapMinutes: 2 }).filter((i) => i.kind === 'GAP')
    ).toHaveLength(1);
  });

  it('renders a gap of exactly the minimum', () => {
    // 09:00-10:00 then 10:05 is a 5-minute gap, and the minimum is inclusive:
    // an off-by-one here silently hid every exact-5-minute seam on a typical day.
    const items = buildTimeline(
      [block('a', '09:00', '10:00'), block('b', '10:05', '11:00')],
      null
    );
    const gap = items.find((item) => item.kind === 'GAP');
    expect(gap).toMatchObject({ minutes: 5, startMinutes: 600, endMinutes: 605 });
  });

  it('computes live progress only for the running block', () => {
    const items = buildTimeline(
      [block('past', '08:00', '09:00'), block('now', '09:00', '11:00'), block('later', '14:00', '15:00')],
      10 * 60
    );
    const [past, now, later] = blockItems(items);
    expect(past?.progressPercent).toBe(0);
    expect(now?.progressPercent).toBe(50);
    expect(now?.minutesRemaining).toBe(60);
    expect(later?.progressPercent).toBe(0);
  });

  it('reports progress for an overnight block past midnight', () => {
    const items = buildTimeline([block('sleep', '22:00', '06:00')], 60);
    const only = blockItems(items)[0];
    expect(only?.phase).toBe('CURRENT');
    expect(only?.minutesElapsed).toBe(180);
    expect(only?.minutesRemaining).toBe(300);
  });

  it('marks an overnight block and records its frame end', () => {
    const only = blockItems(buildTimeline([block('sleep', '22:00', '06:00')], null))[0];
    expect(only?.isOvernight).toBe(true);
    expect(only?.startMinutes).toBe(1320);
    expect(only?.endMinutes).toBe(1800);
    expect(only?.durationMinutes).toBe(480);
  });

  it('links both sides of a conflict', () => {
    const items = buildTimeline(
      [block('a', '09:00', '11:00'), block('b', '10:00', '12:00')],
      null
    );
    const [a, b] = blockItems(items);
    expect(a?.conflictIds).toEqual(['b']);
    expect(a?.hasConflict).toBe(true);
    expect(b?.conflictIds).toEqual(['a']);
  });

  it('does not conflict an overnight block with daytime work', () => {
    const items = buildTimeline(
      [block('work', '09:00', '17:00'), block('sleep', '22:00', '06:00')],
      null
    );
    expect(blockItems(items).every((i) => !i.hasConflict)).toBe(true);
  });

  it('surfaces the log status and reports a missing log as unlogged', () => {
    const items = buildTimeline(
      [
        block('done', '09:00', '10:00', { log: log('COMPLETED') }),
        block('todo', '11:00', '12:00'),
      ],
      null
    );
    const [done, todo] = blockItems(items);
    expect(done?.logStatus).toBe('COMPLETED');
    expect(done?.unlogged).toBe(false);
    expect(todo?.logStatus).toBeNull();
    expect(todo?.unlogged).toBe(true);
  });

  it('carries every RoutineLogStatus through to the display status', () => {
    const statuses = ['COMPLETED', 'PARTIAL', 'MISSED', 'IN_PROGRESS'] as const;
    const items = buildTimeline(
      statuses.map((status, index) =>
        block(status, `${String(9 + index).padStart(2, '0')}:00`, `${String(9 + index).padStart(2, '0')}:30`, {
          log: log(status),
        })
      ),
      null
    );
    expect(blockItems(items).map((i) => i.logStatus)).toEqual([...statuses]);
  });

  it('renders an IN_PROGRESS block as running regardless of log', () => {
    const [only] = blockItems(
      buildTimeline([block('call', '09:00', '10:00', { log: log('IN_PROGRESS') })], 9 * 60 + 30)
    );
    expect(only?.logStatus).toBe('IN_PROGRESS');
    expect(only?.phase).toBe('CURRENT');
  });
});

// ============================================================================

describe('findConflictMap', () => {
  it('is empty for a clean day', () => {
    const map = findConflictMap([block('a', '09:00', '10:00'), block('b', '10:00', '11:00')]);
    expect(map.get('a')).toEqual([]);
    expect(map.get('b')).toEqual([]);
  });

  it('counts a three-way pile-up once per pair, per block', () => {
    const map = findConflictMap([
      block('a', '09:00', '12:00'),
      block('b', '09:30', '12:30'),
      block('c', '10:00', '11:00'),
    ]);
    expect(map.get('a')).toHaveLength(2);
    expect(map.get('b')).toHaveLength(2);
    expect(map.get('c')).toHaveLength(2);
  });
});

// ============================================================================

describe('summarizeDay', () => {
  it('reports a zeroed summary for an empty day', () => {
    const summary = summarizeDay([]);
    expect(summary).toMatchObject({
      scheduledMinutes: 0,
      freeMinutes: 1440,
      blockCount: 0,
      longestGap: null,
      firstStartMinutes: null,
      lastEndMinutes: null,
    });
  });

  it('sums scheduled minutes and measures free time as the remainder', () => {
    const summary = summarizeDay([block('a', '09:00', '10:00'), block('b', '11:00', '12:00')]);
    expect(summary.scheduledMinutes).toBe(120);
    expect(summary.occupiedMinutes).toBe(120);
    expect(summary.freeMinutes).toBe(1320);
  });

  it('de-duplicates overlapping blocks so free time cannot go negative', () => {
    // Scheduled time is the *sum* (240: two blocks, 120 each), but only 180
    // minutes of the calendar are occupied. Subtracting the sum from 1440 gave
    // -20 minutes of "free time" here; subtracting the union gives 1260.
    const summary = summarizeDay([block('a', '09:00', '11:00'), block('b', '10:00', '12:00')]);
    expect(summary.scheduledMinutes).toBe(240);
    expect(summary.occupiedMinutes).toBe(180);
    expect(summary.freeMinutes).toBe(1260);
    expect(summary.conflictCount).toBe(1);
  });

  it('measures an overnight block as the minutes it occupies', () => {
    const summary = summarizeDay([block('sleep', '22:00', '06:00')]);
    expect(summary.scheduledMinutes).toBe(480);
    expect(summary.occupiedMinutes).toBe(480);
    expect(summary.freeMinutes).toBe(960);
  });

  it('merges adjacent blocks into one occupied run', () => {
    const summary = summarizeDay([block('a', '09:00', '10:00'), block('b', '10:00', '11:00')]);
    expect(summary.occupiedMinutes).toBe(120);
  });

  it('separates tracked minutes from total scheduled', () => {
    const summary = summarizeDay([
      block('tracked', '09:00', '10:00', { trackCompletion: true }),
      block('untracked', '11:00', '13:00', { trackCompletion: false }),
    ]);
    expect(summary.scheduledMinutes).toBe(180);
    expect(summary.trackedMinutes).toBe(60);
    expect(summary.trackedCount).toBe(1);
    expect(summary.blockCount).toBe(2);
  });

  it('finds the first start and the last end', () => {
    const summary = summarizeDay([block('a', '09:00', '10:00'), block('b', '21:00', '22:30')]);
    expect(summary.firstStartMinutes).toBe(540);
    expect(summary.lastEndMinutes).toBe(1350);
  });

  it('reports an overnight last end past midnight', () => {
    const summary = summarizeDay([block('a', '09:00', '10:00'), block('sleep', '22:00', '06:00')]);
    expect(summary.lastEndMinutes).toBe(1800);
  });

  it('finds the longest free gap inside the day', () => {
    const summary = summarizeDay([
      block('a', '09:00', '10:00'),
      block('b', '10:10', '10:40'),
      block('c', '15:00', '16:00'),
    ]);
    expect(summary.longestGap?.minutes).toBe(260);
    expect(summary.longestGap?.startMinutes).toBe(640);
    expect(summary.longestGap?.endMinutes).toBe(900);
  });

  it('ignores seams shorter than five minutes when finding the longest gap', () => {
    const summary = summarizeDay([block('a', '09:00', '10:00'), block('b', '10:03', '11:00')]);
    expect(summary.longestGap).toBeNull();
  });

  it('reports no longest gap when the day is back to back', () => {
    expect(summarizeDay([block('a', '09:00', '10:00'), block('b', '10:00', '11:00')]).longestGap)
      .toBeNull();
  });

  it('aggregates the category mix, longest first', () => {
    const summary = summarizeDay([
      block('a', '09:00', '10:00', {
        category: { id: 'c1', name: 'Work', color: '#ff0000' },
      }),
      block('b', '11:00', '14:00', {
        category: { id: 'c2', name: 'Study', color: '#00ff00' },
      }),
      block('c', '15:00', '15:30', {
        category: { id: 'c1', name: 'Work', color: '#ff0000' },
      }),
    ]);
    expect(summary.categoryMix).toEqual([
      { id: 'c2', name: 'Study', color: '#00ff00', minutes: 180, count: 1 },
      { id: 'c1', name: 'Work', color: '#ff0000', minutes: 90, count: 2 },
    ]);
  });

  it('omits categories rather than inventing a placeholder', () => {
    const summary = summarizeDay([block('a', '09:00', '10:00', { category: null })]);
    expect(summary.categoryMix).toEqual([]);
  });

  it('aggregates the energy mix in HIGH, MEDIUM, LOW order', () => {
    const summary = summarizeDay([
      block('a', '09:00', '10:00', { energyLevel: 'LOW' }),
      block('b', '11:00', '12:00', { energyLevel: 'HIGH' }),
      block('c', '13:00', '15:00', { energyLevel: 'HIGH' }),
    ]);
    // HIGH: 60 + 120 = 180 minutes across two blocks. LOW: 60 across one.
    expect(summary.energyMix).toEqual([
      { level: 'HIGH', minutes: 180, count: 2 },
      { level: 'LOW', minutes: 60, count: 1 },
    ]);
  });

  it('ignores an unrecognised energy string rather than counting it', () => {
    const summary = summarizeDay([block('a', '09:00', '10:00', { energyLevel: 'EXTREME' })]);
    expect(summary.energyMix).toEqual([]);
  });
});

// ============================================================================

describe('getNowNext', () => {
  const day = [
    block('a', '09:00', '10:00'),
    block('b', '11:00', '13:00'),
    block('c', '15:00', '16:00'),
  ];

  it('is empty with no clock, which is how a future date renders', () => {
    expect(getNowNext(day, null)).toMatchObject({ current: null, next: null, blocksRemaining: 0 });
  });

  it('is empty for an empty day', () => {
    expect(getNowNext([], 600).current).toBeNull();
  });

  it('finds the running block with its progress', () => {
    const result = getNowNext(day, 12 * 60);
    expect(result.current?.key).toBe('b');
    expect(result.current?.progressPercent).toBe(50);
    expect(result.current?.minutesRemaining).toBe(60);
  });

  it('finds the next block and the minutes until it', () => {
    const result = getNowNext(day, 10 * 60);
    expect(result.current).toBeNull();
    expect(result.next?.key).toBe('b');
    expect(result.minutesUntilNext).toBe(60);
  });

  it('counts blocks remaining including the running one', () => {
    expect(getNowNext(day, 12 * 60).blocksRemaining).toBe(2);
    expect(getNowNext(day, 8 * 60).blocksRemaining).toBe(3);
  });

  it('marks the day complete only once nothing is left', () => {
    expect(getNowNext(day, 17 * 60).dayComplete).toBe(true);
    expect(getNowNext(day, 12 * 60).dayComplete).toBe(false);
    expect(getNowNext(day, 15 * 60).dayComplete).toBe(false);
  });

  it('agrees with buildTimeline about which block is running', () => {
    // The rail and the timeline must never disagree about "now".
    for (const now of [8 * 60, 9 * 60 + 30, 11 * 60, 12 * 60, 15 * 60, 17 * 60]) {
      const fromTimeline = blockItems(buildTimeline(day, now)).find((i) => i.phase === 'CURRENT');
      expect(getNowNext(day, now).current?.key ?? null).toBe(fromTimeline?.key ?? null);
    }
  });

  it('wraps an overnight block into the early hours', () => {
    const night = [block('sleep', '22:00', '06:00')];
    expect(getNowNext(night, 60).current?.key).toBe('sleep');
    expect(getNowNext(night, 60).minutesUntilNext).toBeNull();
  });
});
// ============================================================================

describe('buildGanttLayout: the axis is the clock', () => {
  it('sizes a block by its duration, not by one fixed row', () => {
    // The whole point: a 3-hour block must be visibly taller than a 30-minute one.
    const layout = buildGanttLayout(
      [block('short', '09:00', '09:30'), block('long', '10:00', '13:00')],
      null,
      timeMode({ minRowHeight: 0, pxPerMinute: 1, paddingMinutes: 0 })
    );
    const short = layout.items.find((i) => i.kind === 'BLOCK' && i.block.id === 'short');
    const long = layout.items.find((i) => i.kind === 'BLOCK' && i.block.id === 'long');

    expect(short?.height).toBe(30);
    expect(long?.height).toBe(180);
    expect((long?.height ?? 0) / (short?.height ?? 1)).toBe(6);
  });

  it('positions blocks by their real start time', () => {
    const layout = buildGanttLayout(
      [block('a', '09:00', '10:00'), block('b', '11:00', '12:00')],
      null,
      timeMode({ minRowHeight: 0, pxPerMinute: 1, paddingMinutes: 0, granularityMinutes: 1 })
    );
    const a = layout.items.find((i) => i.kind === 'BLOCK' && i.block.id === 'a');
    const b = layout.items.find((i) => i.kind === 'BLOCK' && i.block.id === 'b');

    // Range starts at 09:00, so the first block sits at 0 and the second an hour down.
    expect(layout.rangeStartMinutes).toBe(540);
    expect(a?.top).toBe(0);
    expect(b?.top).toBe(120);
  });

  it('gives overlapping blocks separate lanes', () => {
    const layout = buildGanttLayout(
      [
        block('a', '09:00', '11:00'),
        block('b', '10:00', '12:00'),
      ],
      null,
      timeMode({ minRowHeight: 0, pxPerMinute: 1 })
    );
    const a = layout.items.find((i) => i.kind === 'BLOCK' && i.block.id === 'a');
    const b = layout.items.find((i) => i.kind === 'BLOCK' && i.block.id === 'b');

    expect(a?.lane).toBe(0);
    expect(b?.lane).toBe(1);
    expect(a?.laneCount).toBe(2);
  });

  it('reuses a lane once the earlier block has finished', () => {
    // Three blocks, only two ever simultaneous: the third must go back to lane 0
    // rather than opening a third column, or a day with one overlap looks like a
    // day with six.
    const layout = buildGanttLayout(
      [
        block('a', '09:00', '10:00'),
        block('b', '09:30', '10:30'),
        block('c', '10:15', '11:00'),
      ],
      null,
      timeMode({ minRowHeight: 0, pxPerMinute: 1 })
    );
    const a = layout.items.find((i) => i.kind === 'BLOCK' && i.block.id === 'a');
    const c = layout.items.find((i) => i.kind === 'BLOCK' && i.block.id === 'c');

    expect(a?.lane).toBe(0);
    expect(c?.lane).toBe(0);
    expect(a?.laneCount).toBe(2);
  });

  it('is one lane for a clean day, so no column structure shows', () => {
    const layout = buildGanttLayout(
      [block('a', '09:00', '10:00'), block('b', '11:00', '12:00')],
      null
    );
    expect(layout.items.filter((i) => i.kind === 'BLOCK').map((i) => i.lane)).toEqual([0, 0]);
  });
});

describe('buildGanttLayout: bounding the axis', () => {
  it('does not start the axis at midnight', () => {
    // An evening-only schedule must fill the height instead of sitting at the
    // bottom of six empty hours.
    const layout = buildGanttLayout([block('dinner', '19:00', '20:30')], null, {
      paddingMinutes: 0,
      granularityMinutes: 1,
    });
    expect(layout.rangeStartMinutes).toBe(1140);
  });

  it('gives a tiny day a minimum span so it stays readable', () => {
    const layout = buildGanttLayout([block('coffee', '09:00', '09:05')], null, {
      minSpanMinutes: 120,
      paddingMinutes: 0,
      granularityMinutes: 1,
    });
    expect(layout.rangeEndMinutes - layout.rangeStartMinutes).toBe(120);
  });

  it('never starts the axis before midnight', () => {
    const layout = buildGanttLayout([block('early', '00:05', '00:30')], null, {
      paddingMinutes: 30,
      granularityMinutes: 1,
    });
    expect(layout.rangeStartMinutes).toBeGreaterThanOrEqual(0);
  });

  it('runs the axis past midnight for an overnight block', () => {
    const layout = buildGanttLayout([block('sleep', '22:00', '06:00')], null, {
      paddingMinutes: 0,
      granularityMinutes: 1,
    });
    expect(layout.rangeEndMinutes).toBeGreaterThan(1440);
  });

  it('returns a usable empty layout', () => {
    const layout = buildGanttLayout([], null);
    expect(layout.items).toEqual([]);
    expect(layout.height).toBeGreaterThan(0);
    expect(typeof layout.heightForMinutes(60)).toBe('number');
  });
});

describe('buildGanttLayout: minRowHeight', () => {
  it('keeps a very short block tall enough to read', () => {
    // A 5-minute block at the raw scale is a 4px sliver; the title would be
    // unreachable. Exaggerating its height is the lesser evil.
    const layout = buildGanttLayout(
      [block('blip', '09:00', '09:05')],
      null,
      timeMode({ minRowHeight: 64, pxPerMinute: 0.5 })
    );
    const blip = layout.items.find((i) => i.kind === 'BLOCK');
    expect(blip?.height).toBe(64);
  });

  it('does not inflate a long block', () => {
    const layout = buildGanttLayout(
      [block('deep', '09:00', '12:00')],
      null,
      timeMode({ minRowHeight: 64, pxPerMinute: 0.5 })
    );
    expect(layout.items.find((i) => i.kind === 'BLOCK')?.height).toBe(90);
  });
});

describe('buildGanttLayout: gaps', () => {
  it('finds the free time between two blocks', () => {
    const layout = buildGanttLayout(
      [block('a', '09:00', '10:00'), block('b', '10:30', '11:00')],
      null,
      timeMode({ minRowHeight: 0, pxPerMinute: 1, paddingMinutes: 0, granularityMinutes: 1 })
    );
    const gap = layout.items.find((i) => i.kind === 'GAP' && i.minutes === 30);
    expect(gap).toBeDefined();
    expect(gap).toMatchObject({ startMinutes: 600, endMinutes: 630 });
  });

  it('does not report free time between two overlapping blocks', () => {
    // The union of 09:00-11:00 and 10:00-12:00 is 09:00-12:00. Walking the
    // blocks pairwise would have produced a phantom 30-minute gap at 11:00.
    const layout = buildGanttLayout(
      [block('a', '09:00', '11:00'), block('b', '10:00', '12:00')],
      null,
      timeMode({ minRowHeight: 0, pxPerMinute: 1 })
    );
    const internal = layout.items.filter(
      (i) => i.kind === 'GAP' && i.startMinutes >= 540 && i.endMinutes <= 720
    );
    expect(internal).toHaveLength(0);
  });

  it('reports no gap for a back-to-back day', () => {
    const layout = buildGanttLayout(
      [block('a', '09:00', '10:00'), block('b', '10:00', '11:00')],
      null,
      timeMode({ minRowHeight: 0, pxPerMinute: 1 })
    );
    const internal = layout.items.filter((i) => i.kind === 'GAP' && i.minutes === 0);
    expect(internal).toHaveLength(0);
  });
});

describe('buildGanttLayout: state agrees with buildTimeline', () => {
  it('carries phase, status and conflicts from the same source', () => {
    // Two implementations of "what state is this block in" is exactly how the
    // rail and the timeline end up disagreeing.
    const blocks = [
      block('now', '09:00', '10:00', { log: log('IN_PROGRESS') }),
      block('clash', '11:00', '12:00'),
      block('clash2', '11:30', '12:30'),
    ];
    const layout = buildGanttLayout(blocks, 9 * 60 + 30);
    const now = layout.items.find((i) => i.kind === 'BLOCK' && i.block.id === 'now');
    const clash = layout.items.find((i) => i.kind === 'BLOCK' && i.block.id === 'clash');

    expect(now?.phase).toBe('CURRENT');
    expect(now?.logStatus).toBe('IN_PROGRESS');
    expect(now?.progressPercent).toBe(50);
    expect(clash?.hasConflict).toBe(true);
  });

  it('has no CURRENT phase without a clock', () => {
    const layout = buildGanttLayout([block('a', '09:00', '10:00')], null);
    expect(layout.items.find((i) => i.kind === 'BLOCK')?.phase).toBe('UPCOMING');
  });

  it('finds an overnight block in the small hours', () => {
    const layout = buildGanttLayout([block('sleep', '22:00', '06:00')], 60);
    const sleep = layout.items.find((i) => i.kind === 'BLOCK');
    expect(sleep?.phase).toBe('CURRENT');
    expect(sleep?.isOvernight).toBe(true);
  });
});
// ============================================================================

describe('buildGanttLayout: the height floor is a content budget', () => {
  it('never renders a block shorter than the three rows it must hold', () => {
    /*
     * A block always renders three rows: timestamp+duration, title, and chips.
     * The floor exists so those rows always fit. This is the regression guard
     * for text clipping and vertical collision: at the previous 64px floor the
     * chip row was silently cut off by the card's `overflow-hidden`.
     *
     *   padding 20 + row1 18 + row2 20 + row3 15 + gaps 4 = 77, plus air -> 88
     */
    const CONTENT_BUDGET_PX = 88;

    for (const [start, end] of [
      ['09:00', '09:01'], // 1 minute
      ['09:00', '09:05'], // 5 minutes
      ['09:00', '09:30'], // 30 minutes
      ['09:00', '09:45'], // 45 minutes
    ]) {
      const layout = buildGanttLayout([block('short', start, end)], null, TIME_MODE);
      const item = layout.items.find((i) => i.kind === 'BLOCK');
      expect(item?.height).toBeGreaterThanOrEqual(CONTENT_BUDGET_PX);
    }
  });

  it('scales above the floor once a block is genuinely long', () => {
    const layout = buildGanttLayout([block('long', '09:00', '12:00')], null, TIME_MODE);
    // 180 minutes at 3 px/min = 540px, comfortably past the 88px floor.
    expect(layout.items.find((i) => i.kind === 'BLOCK')?.height).toBe(540);
  });

  it('is stack mode by DEFAULT, and that is what makes every height 96', () => {
    /*
     * The mirror image of the tests above, pinning the thing that actually caused
     * them. If this ever fails, a `uniformRowHeight` change has taken the page
     * back to time mode - or to a different card height - and the whole
     * time-mode block above is now testing something the product does not do.
     *
     * The height is **96**, not the 80 this test used to assert, and the value is
     * derived rather than chosen. `DEFAULT_UNIFORM_ROW`'s own docblock works the
     * arithmetic: `p-4` of internal padding (16 top + 16 bottom = 32) around
     * three rows separated by `gap-2` (16 + 8 + 18 + 8 + 14 = 64) is 96. An
     * earlier 76px figure was specified as well, and the two cannot both hold —
     * 76 - 32 leaves 44px for 64px of content and clips the chip row by 20px.
     * The padding was kept and the height raised, because padding is what stops
     * text touching the card edge and the height is only a number.
     *
     * The assertion lagged that change. If you are reading this because it just
     * failed against 80, this is the note that explains it: the test was stale,
     * not the layout.
     */
    const layout = buildGanttLayout([block('any', '09:00', '12:00')], null);
    expect(layout.layoutMode).toBe('stack');
    expect(layout.rowHeight).toBe(96);
    expect(layout.items.find((i) => i.kind === 'BLOCK')?.height).toBe(96);
  });

  it('keeps the exact 6x ratio between a 30-minute and a 3-hour block', () => {
    /*
     * The scale is pinned so a 30-minute block clears the 88px content budget:
     * anything below 88/30 px/min would floor it and collapse the ratio, which
     * is what a 0.9 px/min scale did (162/88 = 1.8x).
     */
    const layout = buildGanttLayout(
      [block('short', '09:00', '09:30'), block('long', '10:00', '13:00')],
      null,
      TIME_MODE
    );
    const short = layout.items.find((i) => i.kind === 'BLOCK' && i.block.id === 'short');
    const long = layout.items.find((i) => i.kind === 'BLOCK' && i.block.id === 'long');

    expect(short!.height).toBe(90); // 30 min x 3 px/min, above the floor
    expect(long!.height).toBe(540); // 180 min x 3 px/min
    expect(long!.height / short!.height).toBe(6);
  });
});

describe('buildGanttLayout: short blocks must not overlap each other', () => {
  it('gives two floored blocks in the same lane a second lane instead of stacking them', () => {
    /*
     * Two 5-minute blocks ten minutes apart do not overlap on the clock, so a
     * packer working in clock minutes puts both in lane 0. But each is drawn at
     * the 88px floor, which is ~29 axis-minutes tall, so they would overlap by
     * about 50px on screen. Lane packing therefore measures the drawn extent.
     *
     * **`timeMode()` is required, and that is the point.** This is a TIME-mode
     * guarantee: it depends on `top` being clock-derived and `height` coming from
     * `heightForMinutes` with its floor. Under the default config the layout is
     * stack mode, where cards are a uniform height placed in sequence rows — the
     * two blocks land in different rows and cannot overlap regardless of lanes.
     *
     * It used to run against the default config, where the 88px floor does not
     * apply at all, and asserted a lane split that stack mode has no reason to
     * make. It passed for a reason unrelated to what it claimed to test.
     */
    const layout = buildGanttLayout(
      [block('blip-a', '09:00', '09:05'), block('blip-b', '09:10', '09:15')],
      null,
      timeMode()
    );
    const blocks = layout.items.filter((i) => i.kind === 'BLOCK');

    expect(blocks).toHaveLength(2);
    const [a, b] = blocks.map((i) => ({ top: i.top, height: i.height, lane: i.lane }));
    // They occupy different lanes, so neither card can sit on top of the other.
    expect(a!.lane).not.toBe(b!.lane);
  });

  it('never overlaps two blocks drawn in the same lane, at any duration', () => {
    const cases: Array<[string, string, string, string]> = [
      ['09:00', '09:01', '09:02', '09:03'], // 1 minute, worst case for the floor
      ['09:00', '09:05', '09:10', '09:15'], // 5 minutes
      ['09:00', '09:30', '09:35', '09:40'], // 30 minutes
      ['09:00', '10:00', '10:05', '10:30'], // 1 hour
      ['21:00', '23:00', '23:02', '23:30'], // overnight-adjacent
    ];

    for (const [aStart, aEnd, bStart, bEnd] of cases) {
      const layout = buildGanttLayout(
        [block('a', aStart, aEnd), block('b', bStart, bEnd)],
        null
      );
      const a = layout.items.find((i) => i.kind === 'BLOCK' && i.block.id === 'a');
      const b = layout.items.find((i) => i.kind === 'BLOCK' && i.block.id === 'b');

      if (a!.lane === b!.lane) {
        const overlap = Math.min(a!.top + a!.height, b!.top + b!.height) - Math.max(a!.top, b!.top);
        expect(
          overlap,
          `${aStart}-${aEnd} and ${bStart}-${bEnd} overlap by ${overlap}px in lane ${a!.lane}`
        ).toBeLessThanOrEqual(0);
      }
    }
  });

  it('still packs a clean day into a single full-width lane', () => {
    /*
     * The regression this fix must not cause: measuring drawn extents must not
     * fan out an ordinary day into three columns. Blocks of 30 minutes or more
     * clear the floor at the default scale, so their drawn extent is their clock
     * extent and nothing changes for them.
     */
    const layout = buildGanttLayout(
      [
        block('a', '09:00', '10:00'),
        block('b', '10:15', '11:30'),
        block('c', '13:00', '14:00'),
      ],
      null
    );

    expect(layout.items.every((i) => i.kind === 'GAP' || i.lane === 0)).toBe(true);
    expect(layout.items.find((i) => i.kind === 'BLOCK')?.laneCount).toBe(1);
  });
});
describe('buildGanttLayout: stack mode measures lanes on the clock', () => {
  /*
    The bug: stack mode formed its ROWS from clock spans but assigned LANES from
    drawn extents. A short block's drawn height (the 96px uniform card) converted
    back through pxPerMinute into virtual minutes it did not really occupy, so two
    blocks that never overlapped on the clock were treated as conflicting and split
    into separate lanes - narrowing both. That is the squeezed-column look stack
    mode exists to prevent.

    Sequential short blocks are the clearest case: on the clock each ends exactly
    where the next begins, so there is no overlap of any kind.
  */
  it('keeps back-to-back short blocks in one full-width lane', () => {
    const layout = buildGanttLayout(
      [
        block('a', '09:00', '09:10'),
        block('b', '09:10', '09:20'),
        block('c', '09:20', '09:30'),
      ],
      null
    );

    expect(layout.layoutMode).toBe('stack');
    const blocks = layout.items.filter((i) => i.kind === 'BLOCK');
    expect(blocks).toHaveLength(3);
    // One column, and every card full width.
    expect(blocks.every((i) => i.lane === 0)).toBe(true);
    expect(blocks.every((i) => i.laneCount === 1)).toBe(true);
  });

  it('still separates two blocks that genuinely overlap on the clock', () => {
    const layout = buildGanttLayout(
      [
        block('a', '09:00', '10:30'),
        block('b', '10:00', '11:00'),
      ],
      null
    );

    const blocks = layout.items.filter((i) => i.kind === 'BLOCK');
    const lanes = blocks.map((i) => i.lane).sort();
    // A real clash must still be visible as two columns, or the fix went too far.
    expect(lanes).toEqual([0, 1]);
  });

  it('does not narrow a block whose only neighbour starts after it ends', () => {
    const layout = buildGanttLayout(
      [
        block('a', '06:00', '06:05'),
        block('b', '18:00', '19:00'),
      ],
      null
    );

    const blocks = layout.items.filter((i) => i.kind === 'BLOCK');
    expect(blocks.every((i) => i.laneCount === 1)).toBe(true);
  });

  it('leaves time mode on the drawn extent, where the floor genuinely matters', () => {
    /*
      The mirror image, so the fix cannot silently regress time mode. There a short
      block IS drawn taller than its clock span, and reserving that is correct -
      otherwise the next card in the lane would start underneath it.
    */
    const layout = buildGanttLayout(
      [
        block('a', '09:00', '09:05'),
        block('b', '09:10', '10:00'),
      ],
      null,
      timeMode()
    );

    expect(layout.layoutMode).toBe('time');
    const blocks = layout.items.filter((i) => i.kind === 'BLOCK');
    /*
     * 'a' is 5 minutes, floored to 88px, which is ~29 axis-minutes — so its drawn
     * extent reaches past 09:10 and the two ARE split. That is the drawn extent
     * doing its job, and it is the opposite of the stack-mode assertion above:
     * same inputs, two modes, two correct answers.
     */
    const lanes = blocks.map((i) => i.lane).sort();
    expect(lanes).toEqual([0, 1]);
  });
});