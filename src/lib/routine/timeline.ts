import type { RoutineLogStatus } from '@/generated/prisma';
import type { ResolvedRoutineBlock } from '@/types/routine';
import {
  MINUTES_PER_DAY,
  intervalsFor,
  overlapMinutes,
  type Interval,
} from './conflicts';
import {
  calculateBlockDuration,
  calculateBlockProgress,
  isOvernightBlock,
  minutesUntilBlock,
} from './duration';

/**
 * Pure timeline derivation for `/routine`.
 *
 * Everything the page draws — ordering, phase, progress, conflicts, gaps, the
 * day summary, "what's now / what's next" — is computed here from blocks plus
 * one number: the current time in the user's own timezone. No React, no clock,
 * no database, so all of it is unit-testable and re-runnable on every render
 * without risk of divergence between the timeline and the rail.
 *
 * ## Overnight blocks
 *
 * An overnight block (22:00 -> 06:00) is a single item positioned at its
 * **start** on the day's rail, labelled "ends next day". It is one row, not two,
 * because splitting it would mean inventing a `06:00` row on the *following*
 * date and the page has no tomorrow's blocks to reconcile it with.
 *
 * Its **phase** is computed against both intervals it occupies, which is the
 * part that must be right: at 01:00 a 22:00 -> 06:00 block is CURRENT, not
 * "upcoming", and its progress bar reads 180/480 rather than a negative number.
 *
 * Before its start time it is UPCOMING, including after its end time. That is
 * deliberate and it is the honest reading of a *recurring daily* template: at
 * 07:00 tonight's Sleep block has not happened yet, and whether last night's did
 * is answered by the log, not by the clock. `logStatus` drives the visual state
 * (`DONE`/`PARTIAL`/`MISSED`), which is why an overnight block correctly shows
 * as completed even though its clock phase has rolled back to UPCOMING.
 */

export type BlockPhase = 'PAST' | 'CURRENT' | 'UPCOMING';

/** The four `RoutineLogStatus` values, plus the absence of a log. */
export type TimelineDisplayStatus = RoutineLogStatus | null;

/** Free space between two blocks, rendered as a tappable "35 min free" row. */
export interface TimelineGap {
  kind: 'GAP';
  /** Stable React key. */
  key: string;
  startMinutes: number;
  endMinutes: number;
  minutes: number;
  /**
   * True when the gap crosses midnight (only possible when the preceding block
   * is overnight and something still follows it, which cannot happen today — so
   * this is future-proofing for the split-render decision, not a live case).
   */
  wrapsMidnight: boolean;
}

export interface TimelineBlock {
  kind: 'BLOCK';
  key: string;
  block: ResolvedRoutineBlock;
  phase: BlockPhase;
  /** Minutes from midnight, with an overnight end pushed past 1440. */
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  isOvernight: boolean;
  /** 0-100. Only meaningful for `CURRENT`; 0 elsewhere by contract. */
  progressPercent: number;
  minutesElapsed: number;
  minutesRemaining: number;
  /** Ids of the blocks this one overlaps. */
  conflictIds: string[];
  /** Ids of every block it conflicts with, for the bracket. Same as `conflictIds`. */
  hasConflict: boolean;
  /** Free space immediately before this block, when it is not the first. */
  gapBefore: TimelineGap | null;
  logStatus: TimelineDisplayStatus;
  /** True when the block carries no completion log at all. */
  unlogged: boolean;
}

export type TimelineItem = TimelineBlock | TimelineGap;

export interface BuildTimelineOptions {
  /**
   * Gaps shorter than this are not rendered.
   *
   * Default 5 minutes: a one-minute seam between two blocks is not "free time"
   * worth offering as a place to add a block, and rendering it adds a
   * click target that can only ever be useless.
   */
  minGapMinutes?: number;
}

/**
 * A block's end in the day's frame.
 *
 * An overnight block's end is pushed past midnight so a duration and a gap
 * arithmetic never has to special-case it.
 */
export function blockEndMinutes(startTime: string, endTime: string): number {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  return end > start ? end : end + MINUTES_PER_DAY;
}

/**
 * Minutes from midnight for an `HH:mm` string.
 *
 * Deliberately lenient, unlike `conflicts.timeToMinutesExact`. This runs over
 * data already in the database on every render, and a single malformed time
 * should render that one block oddly rather than throw and blank the page.
 */
function toMinutes(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** `HH:mm` for minutes from midnight. */
function toClock(minutes: number): string {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/**
 * Is `nowMinutes` inside this block, accounting for the midnight wrap?
 *
 * Delegates to `intervalsFor`, the same expansion the overlap check uses, so
 * "is it running now" and "does it clash with that" can never disagree.
 */
export function isBlockActiveNow(
  startTime: string,
  endTime: string,
  nowMinutes: number
): boolean {
  return intervalsFor({ startTime, endTime }).some(
    ([start, end]) => nowMinutes >= start && nowMinutes < end
  );
}

/**
 * Where a block sits relative to the current time.
 *
 * `nowMinutes` of `null` means "we do not have a trustworthy clock for this
 * date" — a past or future date, or the first paint before hydration. Every
 * block is then UPCOMING, which renders without a now line and without any
 * PAST dimming, so a future date looks like a plan rather than a finished day.
 */
export function phaseOf(
  startTime: string,
  endTime: string,
  nowMinutes: number | null
): BlockPhase {
  if (nowMinutes === null) return 'UPCOMING';

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const overnight = end <= start;

  if (isBlockActiveNow(startTime, endTime, nowMinutes)) return 'CURRENT';

  // Only a block whose start time has passed can be over. For an overnight
  // block that means the evening half (22:00 onward), which `isBlockActiveNow`
  // has already handled; the morning half is handled by that same call. What is
  // left is "before it started today", which is UPCOMING.
  return nowMinutes > start && !overnight ? 'PAST' : 'UPCOMING';
}

/**
 * Order blocks the way a schedule reads.
 *
 * By **start time**, not by `sortOrder`. `sortOrder` is only a tiebreak: it
 * exists because the swap-reorder operation needs two distinct numbers to
 * exchange, and treating it as the primary sort is what made "nudge the block
 * 15 minutes later" appear to reorder nothing (the times changed, the orders
 * did not). Blocks sharing a start time fall back to `sortOrder`, then title,
 * so the order is total and stable.
 */
export function sortBlocks(blocks: readonly ResolvedRoutineBlock[]): ResolvedRoutineBlock[] {
  return [...blocks].sort((a, b) => {
    const startDelta = toMinutes(a.startTime) - toMinutes(b.startTime);
    if (startDelta !== 0) return startDelta;
    const orderDelta = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDelta !== 0) return orderDelta;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Ids of blocks overlapping each other, in both directions.
 *
 * Built pairwise rather than by comparing each block to all the others so an
 * N-block day is O(n^2) comparisons of two numbers rather than N runs of the
 * full interval expansion.
 */
export function findConflictMap(
  blocks: readonly ResolvedRoutineBlock[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const block of blocks) map.set(block.id, []);

  for (let i = 0; i < blocks.length; i += 1) {
    const a = blocks[i];
    if (!a) continue;
    for (let j = i + 1; j < blocks.length; j += 1) {
      const b = blocks[j];
      if (!b) continue;
      const shared = overlapMinutes(a, b);
      if (shared > 0) {
        map.get(a.id)?.push(b.id);
        map.get(b.id)?.push(a.id);
      }
    }
  }

  return map;
}

/**
 * The day's timeline: blocks in time order, with the free space between them.
 *
 * Gaps are inserted between consecutive blocks in start order. Nothing is drawn
 * before the first block or after the last: an empty 00:00-06:00 stretch is not
 * information, it is the absence of it, and rendering it as a 24-hour grid is
 * what made the old list feel like a form.
 */
export function buildTimeline(
  blocks: readonly ResolvedRoutineBlock[],
  nowMinutes: number | null,
  options: BuildTimelineOptions = {}
): TimelineItem[] {
  const minGapMinutes = options.minGapMinutes ?? 5;
  const ordered = sortBlocks(blocks);

  if (ordered.length === 0) return [];

  const conflicts = findConflictMap(ordered);
  const items: TimelineItem[] = [];

  ordered.forEach((block, index) => {
    const startMinutes = toMinutes(block.startTime);
    const endMinutes = blockEndMinutes(block.startTime, block.endTime);
    const isOvernight = isOvernightBlock(block.startTime, block.endTime);
    const phase = phaseOf(block.startTime, block.endTime, nowMinutes);

    const progress =
      phase === 'CURRENT' && nowMinutes !== null
        ? calculateBlockProgress(
            block.startTime,
            block.endTime,
            toClock(nowMinutes)
          )
        : { percentage: 0, minutesElapsed: 0, minutesRemaining: endMinutes - startMinutes };

    const previous = ordered[index - 1];
    let gapBefore: TimelineGap | null = null;

    if (previous) {
      const previousEnd = blockEndMinutes(previous.startTime, previous.endTime);
      // A previous overnight block ends past midnight, so nothing in *this*
      // day follows it and there is no gap to offer.
      const gapLength = previousEnd >= MINUTES_PER_DAY ? 0 : startMinutes - previousEnd;

      if (gapLength >= minGapMinutes) {
        gapBefore = {
          kind: 'GAP',
          key: `gap:${previous.id}:${block.id}`,
          startMinutes: previousEnd,
          endMinutes: startMinutes,
          minutes: gapLength,
          wrapsMidnight: false,
        };
      }
    }

    const conflictIds = conflicts.get(block.id) ?? [];

    const timelineBlock: TimelineBlock = {
      kind: 'BLOCK',
      key: block.id,
      block,
      phase,
      startMinutes,
      endMinutes,
      durationMinutes: calculateBlockDuration(block.startTime, block.endTime),
      isOvernight,
      progressPercent: progress.percentage,
      minutesElapsed: progress.minutesElapsed,
      minutesRemaining: progress.minutesRemaining,
      conflictIds,
      hasConflict: conflictIds.length > 0,
      gapBefore,
      logStatus: block.log?.status ?? null,
      unlogged: block.log == null,
    };

    if (gapBefore) items.push(gapBefore);
    items.push(timelineBlock);
  });

  return items;
}

/**
 * Proportional (Gantt) placement.
 *
 * ## Why the rows are no longer a flat list
 *
 * Every block was rendered as one fixed-height row in start-time order. A
 * 30-minute coffee and a three-hour block of deep work were therefore the same
 * height, and two blocks that overlap in time were stacked rather than shown
 * sharing the clock — which is exactly the information a page about time exists
 * to convey. The day's *shape* was not visible anywhere except the 24-hour bar
 * in the rail.
 *
 * Rows are now positioned and sized by real time, so the vertical axis is the
 * clock. That reintroduces the objection that killed the first attempt at this —
 * that a proportional layout spanning 00:00–24:00 leaves six dead hours above an
 * evening schedule, and makes a six-block day and a twenty-block day render at
 * identical height. Both are solved by **bounding the axis to the day that is
 * actually scheduled** (see {@link buildGanttLayout}) rather than to midnight.
 */

/** Options for {@link buildGanttLayout}. */
export interface GanttLayoutOptions {
  /**
   * Floor on a block's height, in px. Without it a 5-minute block is a hairline
   * and its title is unreachable — a block too short to read is worse than a
   * block whose height is slightly exaggerated.
   */
  minRowHeight?: number;
  /** Vertical scale. Duration-proportional, so this is the only tuning knob. */
  pxPerMinute?: number;
  /** Breathing room above the first and below the last block, in minutes. */
  paddingMinutes?: number;
  /** Axis granularity for rounding, in minutes (15 by default). */
  granularityMinutes?: number;
  /** Never let the axis span less than this, so a single short block is legible. */
  minSpanMinutes?: number;
  /**
   * Render every block at this height and stack them in start order, instead of
   * scaling height to duration and positioning by the clock.
   *
   * ## The two modes are mutually exclusive, and that is the point
   *
   * A uniform card cannot also sit at its true time. If every block is 72px tall
   * but `00:00–05:00` spans 600 axis-minutes, the vertical position of every block
   * after it is wrong by an increasing amount — the axis would be a precise,
   * confident lie. So choosing uniform means giving up time-as-vertical-position,
   * and with it the hour ruler, the rail and a now line that tracks the clock.
   * Duration stays legible because each row prints its own `00:00 → 05:00  5h`.
   *
   * Time mode (`null`, the default) is kept because it is the better chart and is
   * what the engine's tests pin — see the note on the tests below.
   */
  uniformRowHeight?: number | null;
  /**
   * Gap between stacked rows in uniform mode, px. Defaults to roughly an eighth
   * of the row height, so a caller changing the row height gets proportional
   * spacing rather than a card that is mostly air.
   */
  rowGap?: number;
}

export interface GanttBlockItem {
  kind: 'BLOCK';
  key: string;
  /** Top edge, px from the top of the chart. */
  top: number;
  /** Height, px. Never below `minRowHeight`. */
  height: number;
  /** Which horizontal lane this block occupies. Lanes disambiguate overlaps. */
  lane: number;
  /**
   * Lanes in use **during this block's own span**, so its width is
   * `1 / laneCount` of the container.
   *
   * This is deliberately not the day's maximum. A single global count meant one
   * overlapping pair anywhere halved the width of every block, including the many
   * that overlapped nothing; see the derivation in `buildGanttLayout`. A block
   * with no neighbours reports 1 and spans the full width.
   */
  laneCount: number;
  startMinutes: number;
  endMinutes: number;
  block: ResolvedRoutineBlock;
  phase: BlockPhase;
  logStatus: TimelineDisplayStatus;
  isOvernight: boolean;
  progressPercent: number;
  minutesRemaining: number;
  conflictIds: string[];
  hasConflict: boolean;
  /** The item for this block's own row, for meta lookups. */
  timeline: TimelineBlock;
}

export interface GanttGapItem {
  kind: 'GAP';
  key: string;
  top: number;
  height: number;
  startMinutes: number;
  endMinutes: number;
  minutes: number;
}

export type GanttItem = GanttBlockItem | GanttGapItem;

export interface GanttLayout {
  items: GanttItem[];
  /** Total chart height, px. */
  height: number;
  /** First minute on the axis. Not necessarily 0. */
  rangeStartMinutes: number;
  /** Last minute on the axis. Past 1440 when the day ends overnight. */
  rangeEndMinutes: number;
  /** Minutes -> px, for placing the now line and hour ticks on the same scale. */
  pxPerMinute: number;
  /** A block's height for a given duration, so callers can size a fixed height. */
  heightForMinutes: (minutes: number) => number;
  /**
   * Which of the two mutually exclusive layouts produced this result.
   *
   * The component needs this to decide whether it may draw a time ruler and a
   * clock-positioned now line. In `'stack'` the vertical axis is sequence order,
   * so those would be wrong — a caller that ignored this would draw an hour ruler
   * beside a list in which 09:00 sits above 14:00.
   */
  layoutMode: 'time' | 'stack';
  /**
   * Height of one stacked row, px. `null` in time mode.
   *
   * The now line in stack mode is positioned at the top edge of the row holding
   * the current block, which is this value plus the row's index.
   */
  rowHeight: number | null;
}

const DEFAULT_GANTT: Required<GanttLayoutOptions> = {
  /**
   * Floor on a block's height, in px.
   *
   * This is a **content budget**, not an arbitrary minimum. A block always
   * renders three rows — timestamp+duration, title, and chips — and each has to
   * fit without clipping:
   *
   *   padding (2 x 10px)          20
   *   row 1  time + duration      18
   *   row 2  title                20
   *   row 3  chips                15
   *   gaps (2 x 2px)               4
   *                              ---
   *                               77  →  88 with breathing room
   *
   * At the previous 64 the third row was silently cut off, which is how a short
   * block ended up showing a title with its chips sliced in half — the text
   * overflow and collision this floor exists to prevent. A 30-minute block is
   * therefore drawn slightly taller than 30 minutes; that is a deliberate,
   * bounded exaggeration in exchange for never truncating a block's content.
   */
  minRowHeight: 60,
  /**
   * Vertical scale, px per minute.
   *
   * ## This value is not a preference — it is forced
   *
   * Two requirements pin it to a single point:
   *
   *  - a 30-minute block must clear the 60px minimum, which needs
   *    `pxPerMinute >= 60 / 30 = 2`, and
   *  - height must stay strictly proportional, so a 3-hour block must be exactly
   *    6x a 30-minute one.
   *
   * At `2` both hold at once, with the 30-minute block landing exactly on the
   * 60px floor: 30 min -> 60px, 1h -> 120, 2h -> 240, 3h -> 360 = 6 x 60, 4h ->
   * 480, 5h -> 600. Only blocks under 30 minutes are floored, and they all share
   * one minimum size, which is honest — a 15-minute task and a 20-minute task
   * are both "a small block".
   *
   * 3 px/min also satisfied the ratio but made the day ~3400px of scroll for
   * ~1140 scheduled minutes, and 1.6 px/min was comfortable but floored every
   * sub-55-minute block and broke the 6x. 2 is the only value that gives a
   * 120px-per-hour axis *and* the required ratio.
   *
   * A ~1140-minute day lands near 2300px, which scrolls inside the panel. That
   * is the same trade a calendar day view makes, and the panel scrolls rather
   * than the page.
   *
   * Narrow viewports get a smaller scale *and* a smaller floor — see
   * `useTimelineScale`.
   */
  pxPerMinute: 2,
  /*
   * The `pxPerMinute` docblock above describes time mode. The UI ships uniform
   * mode by default; see `uniformRowHeight` for why, and note that the engine's
   * tests pin time mode, so they no longer describe what the page renders by
   * default. Both modes remain real and both are exercised.
   */
  /**
   * Uniform card height, i.e. the schedule is a regular list rather than a
   * time-scaled chart. See `uniformRowHeight` for why the two cannot coexist.
   *
   * 96px is *derived*, not chosen. The card is asked to carry `p-4` of internal
   * padding (16px top + 16px bottom = 32) around three rows separated by `gap-2`:
   * timestamp 16 + gap 8 + title 18 + gap 8 + chips 14 = **64**. 32 + 64 = 96.
   *
   * A 76px minimum with `p-4` was also specified, and those two numbers cannot
   * both hold: 76 - 32 leaves 44px for 64px of content, which clips the chip row
   * by 20px. The padding was kept and the height raised, because padding is the
   * thing that stops text touching the card edge and the height is only a number.
   *
   * It is deliberately *not* the 168px the tall-block furniture needs, so no card
   * in this mode grows a duration numeral, an elapsed fill or a description.
   */
  uniformRowHeight: 96,
  /**
   * Gap between stacked rows in uniform mode. Scaled from the row height rather
   * than fixed, so a caller changing the row height gets proportional spacing
   * instead of a card that is mostly air.
   */
  /*
   * Gap between stacked rows.
   *
   * 14px rather than the 10 it was, and the reason is the material rather than
   * the maths. Every card is a blurred glass capsule, and two translucent panels
   * 10px apart read as one continuous surface — the backdrop-filter of each
   * samples the other, so the gap fills in with colour and the cards appear to
   * touch. At 14px there is enough clear space between them for the eye to
   * separate one block from the next, and each card's top hairline survives
   * instead of being dissolved into its neighbour.
   *
   * Raised again to 18px once the cards were visible in a scrolling pane and
   * still read as one merged column at a glance. The extra room also gives the
   * pointer a safe band between two adjacent cards, so moving down the list does
   * not trigger a hover on the block below.
   */
  rowGap: 18,
  paddingMinutes: 15,
  granularityMinutes: 15,
  minSpanMinutes: 180,
};
function roundDown(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

function roundUp(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/**
 * Assign each block to the leftmost lane that is free for its whole duration.
 *
 * The textbook interval-graph greedy, and the only assignment that keeps lanes
 * as narrow as possible: a block never jumps to a new column while an earlier
 * one could have taken it, so `laneCount` reflects the day's true maximum
 * simultaneous overlap rather than the number of blocks.
 *
 * Occupancy is measured on the block's **visual** extent, not its clock extent
 * (`occupyUntilMinutes`). Those differ whenever the height floor applies: a
 * 5-minute block drawn at 88px covers ~29 axis-minutes, so packing it against a
 * block that starts 10 minutes later would overlap the cards by ~50px. The floor
 * therefore reserves its own space in the packing, which keeps the invariant
 * that no two blocks in one lane ever overlap on screen.
 */
function assignLanes(
  ordered: Array<{ id: string; start: number; occupyUntilMinutes: number }>
): Map<string, number> {
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();

  for (const entry of ordered) {
    let lane = laneEnds.findIndex((end) => end <= entry.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(entry.occupyUntilMinutes);
    } else {
      laneEnds[lane] = entry.occupyUntilMinutes;
    }
    lanes.set(entry.id, lane);
  }

  return lanes;
}

/**
 * Lay the day out on a real time axis.
 *
 * ## The axis is bounded to the schedule, not to midnight
 *
 * `rangeStart`/`rangeEnd` snap outward from the first block's start and the last
 * block's end, with a floor of {@link GanttLayoutOptions.minSpanMinutes}. That
 * is what makes this work as a list *and* as a chart: an evening-only schedule
 * occupies the full height instead of sitting at the bottom of six empty hours,
 * and a day with one short block still gets enough axis to read.
 *
 * @param nowMinutes Minutes from midnight in the user's zone, or `null` for a
 * date with no trustworthy clock (past or future). `null` simply omits the
 * CURRENT phase; it does not change the geometry.
 */
export function buildGanttLayout(
  blocks: readonly ResolvedRoutineBlock[],
  nowMinutes: number | null,
  options: GanttLayoutOptions = {}
): GanttLayout {
  const config = { ...DEFAULT_GANTT, ...options };
  const ordered = sortBlocks(blocks);

  const heightForMinutes = (minutes: number) =>
    Math.max(config.minRowHeight, minutes * config.pxPerMinute);

  if (ordered.length === 0) {
    return {
      items: [],
      height: config.minRowHeight,
      rangeStartMinutes: 0,
      rangeEndMinutes: config.minSpanMinutes,
      pxPerMinute: config.pxPerMinute,
      heightForMinutes,
      layoutMode: 'time',
      rowHeight: null,
    };
  }

  const spans = ordered.map((block) => ({
    id: block.id,
    start: toMinutes(block.startTime),
    end: blockEndMinutes(block.startTime, block.endTime),
  }));

  const rawStart = Math.min(...spans.map((span) => span.start));
  const rawEnd = Math.max(...spans.map((span) => span.end));

  const rangeStartMinutes = Math.max(0, roundDown(rawStart, config.granularityMinutes) - config.paddingMinutes);
  let rangeEndMinutes = roundUp(rawEnd, config.granularityMinutes) + config.paddingMinutes;
  if (rangeEndMinutes - rangeStartMinutes < config.minSpanMinutes) {
    rangeEndMinutes = rangeStartMinutes + config.minSpanMinutes;
  }

  const toPx = (minutes: number) => (minutes - rangeStartMinutes) * config.pxPerMinute;

  /*
   * Lane packing uses each block's visual extent, because that is the extent
   * that has to be collision-free. When the height floor applies the drawn card
   * is taller than its clock span, and packing on clock spans alone let two
   * blocks overlap by tens of pixels. For any block at or above the floor's
   * break-even duration (~30 min at the default scale) this is exactly the clock
   * extent, so the normal case is unchanged and only the pathological case pays.
   *
   * The returned `top` is still pure clock time, so the hour grid, the rail and
   * the now marker all stay aligned with the cards they annotate.
   */
  const uniform = config.uniformRowHeight;
const isStacked = uniform !== null && uniform !== undefined;

  /*
   * The extent a block reserves in its lane.
   *
   * ## Why this differs between the two modes
   *
   * **Time mode** measures the *drawn* extent, and that is deliberate. `heightForMinutes`
   * applies a floor, so a 5-minute block is drawn 88px tall — about 29 axis-minutes.
   * Measuring its clock span instead would let the next block in the same lane start
   * while the card was still on screen, and they would overlap by ~50px.
   *
   * **Stack mode** must measure the *clock* span, because that is how its rows are
   * formed. Rows come from `spans` (clock), so lanes have to come from the same
   * axis. Using the drawn extent here put a short block's virtual overflow into
   * conflict with the next one even though they never actually overlapped, splitting
   * non-clashing blocks into separate lanes and narrowing them — precisely the
   * squeezed-column layout stack mode exists to avoid. In stack mode every card is
   * the same height, so there is no floor to defend against and no reason to
   * reserve more than the block's real duration.
   */
  const laneSpans = spans.map((span) => ({
    id: span.id,
    start: span.start,
    occupyUntilMinutes: isStacked
      ? span.end
      : span.start + heightForMinutes(span.end - span.start) / config.pxPerMinute,
  }));

  const lanes = assignLanes(laneSpans);
  const conflicts = findConflictMap(ordered);

  /*
   * Uniform mode: stack the blocks in start order at a constant height.
   *
   * ## How rows are formed
   *
   * Walking the sorted blocks, a new row begins as soon as a block starts at or
   * after the end of every block already in the current row. So genuinely
   * overlapping blocks share a row and sit side by side in their lanes, while
   * everything sequential gets its own regular row underneath. That is the whole
   * difference from a list: the side-by-side case still *reads* as a clash.
   *
   * Overlap here is measured on the **clock** interval, not the visual extent.
   * In uniform mode every card is the same height, so the drawn extent carries no
   * information about time and a visual comparison would be meaningless.
   *
   * `rangeStartMinutes`/`rangeEndMinutes` are still populated, so a caller can
   * label the axis — but a caller must not draw a time ruler from them, because
   * in this mode vertical position is sequence order, not the clock. `HourGrid`,
   * `Rail` and the clock-positioned now line are all suppressed by the component
   * when `layoutMode` is `'stack'`.
   */
  const rowTopById = new Map<string, number>();
  const step = (uniform ?? 0) + config.rowGap;
  let rowCount = 0;
  if (isStacked) {
    let rowIndex = 0;
    let rowEnd = Number.NEGATIVE_INFINITY;
    for (const span of spans) {
      if (span.start >= rowEnd) {
        rowEnd = span.end;
        rowIndex += 1;
      } else {
        // Inside the current row: extend it, since this block runs past its end.
        rowEnd = Math.max(rowEnd, span.end);
      }
      rowTopById.set(span.id, (rowIndex - 1) * step);
    }
    rowCount = rowIndex;
  }

  /*
   * Lanes occupied *during each block's own span*, not the day's maximum.
   *
   * ## The bug this replaces
   *
   * A single global `laneCount` — the most lanes used at any moment in the day —
   * was stamped onto every block. One overlapping pair anywhere in the schedule
   * therefore halved the width of every other block, including the long evening
   * run of back-to-back blocks that overlapped nothing at all. A day with a
   * single 20:00 clash rendered eleven non-overlapping blocks at 50% width, which
   * read as "the layout collapsed" rather than as "two things clash here".
   *
   * ## Why "during its own span" and not "neighbours + 1"
   *
   * Counting only the blocks that actually overlap this one would still be
   * wrong: two blocks can both be in lane 0 at different times and a third can
   * sit in lane 1 across both of them, so the *pair* overlaps nothing while the
   * trio's shared period needs two lanes. Taking the highest lane index among
   * everything overlapping the span and adding one is the measure that matches
   * what is drawn, and it degenerates to 1 for an isolated block — which is the
   * whole point.
   *
   * Overlap is measured on `occupyUntilMinutes`, the same visual extent the lane
   * packer used, so this can never disagree with the packing that produced
   * `lanes`. O(n²), which is a few hundred comparisons on a realistic day.
   *
   * ## The accumulator must start at the block's own lane
   *
   * This is the bug that made overlapping blocks vanish off the right edge.
   * Seeding `highestLane` at 0 and only considering *other* blocks' lanes means a
   * block in lane 1 whose sole overlap is a lane-0 block resolves to
   * `laneCount: 1` — and the renderer then places it at `left: (1/1)*100%`, i.e.
   * 100% off-canvas, at full width. Seeding at the block's own lane guarantees
   * `laneCount >= ownLane + 1`, which is the invariant the width arithmetic
   * depends on: a block must always have room to the right of the lane it is in.
   */
  const spanById = new Map(laneSpans.map((span) => [span.id, span]));
  const laneCountById = new Map<string, number>();
  for (const block of ordered) {
    const own = spanById.get(block.id);
    if (!own) {
      laneCountById.set(block.id, 1);
      continue;
    }
    // Seeded with this block's own lane, not 0. See the note above.
    let highestLane = lanes.get(block.id) ?? 0;
    for (const other of laneSpans) {
      if (other.id === block.id) continue;
      if (other.start < own.occupyUntilMinutes && own.start < other.occupyUntilMinutes) {
        highestLane = Math.max(highestLane, lanes.get(other.id) ?? 0);
      }
    }
    laneCountById.set(block.id, highestLane + 1);
  }

  // The now line and progress read from the same timeline objects the flat
  // layout produced, so the two renderings can never disagree about phase,
  // status or overlap.
  const timelineItems = buildTimeline(ordered, nowMinutes);
  const timelineById = new Map<string, TimelineBlock>();
  for (const item of timelineItems) {
    if (item.kind === 'BLOCK') timelineById.set(item.block.id, item);
  }

  const items: GanttItem[] = ordered.map((block) => {
    const span = spans.find((entry) => entry.id === block.id);
    const start = span?.start ?? toMinutes(block.startTime);
    const end = span?.end ?? start;
    const timeline = timelineById.get(block.id);
    const lane = lanes.get(block.id) ?? 0;

    return {
      kind: 'BLOCK' as const,
      key: block.id,
      // In stack mode the vertical axis is sequence order, so the card's position
      // comes from the row it was placed in and its height is the constant.
      top: isStacked ? (rowTopById.get(block.id) ?? 0) : toPx(start),
      height: isStacked ? (uniform ?? 0) : heightForMinutes(end - start),
      lane,
      laneCount: laneCountById.get(block.id) ?? 1,
      startMinutes: start,
      endMinutes: end,
      block,
      phase: timeline?.phase ?? phaseOf(block.startTime, block.endTime, nowMinutes),
      logStatus: block.log?.status ?? null,
      isOvernight: isOvernightBlock(block.startTime, block.endTime),
      progressPercent: timeline?.progressPercent ?? 0,
      minutesRemaining: timeline?.minutesRemaining ?? 0,
      conflictIds: conflicts.get(block.id) ?? [],
      hasConflict: (conflicts.get(block.id) ?? []).length > 0,
      timeline: timeline ?? ({
        kind: 'BLOCK',
        key: block.id,
        block,
        phase: phaseOf(block.startTime, block.endTime, nowMinutes),
        startMinutes: start,
        endMinutes: end,
        durationMinutes: calculateBlockDuration(block.startTime, block.endTime),
        isOvernight: isOvernightBlock(block.startTime, block.endTime),
        progressPercent: 0,
        minutesElapsed: 0,
        minutesRemaining: end - start,
        conflictIds: conflicts.get(block.id) ?? [],
        hasConflict: false,
        gapBefore: null,
        logStatus: block.log?.status ?? null,
        unlogged: block.log == null,
      } as TimelineBlock),
    };
  });

  /*
   * Gaps: stretches of the axis no block occupies. Measured on the **union** of
   * all intervals, so two blocks that overlap each other do not leave a phantom
   * "free" stripe between them — which is what subtracting per-block gaps did.
   */
  const merged: Array<[number, number]> = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last[1]) {
      last[1] = Math.max(last[1], span.end);
    } else {
      merged.push([span.start, span.end]);
    }
  }

  const gaps: GanttGapItem[] = [];

  /*
   * Gaps only exist in time mode.
   *
   * A gap is free space *on the axis*, positioned by its clock span, so in stack
   * mode it would be drawn at a vertical offset that corresponds to nothing —
   * an hour-long gap and a five-minute gap would both render as the same sliver
   * of `rowGap` air. The regular spacing between stacked rows already carries
   * that meaning, so the items are simply not emitted.
   */
  if (!isStacked) {
    let cursor = rangeStartMinutes;
    for (const [start, end] of merged) {
      if (start > cursor) {
        const minutes = start - cursor;
        gaps.push({
          kind: 'GAP',
          key: `gap:${cursor}:${start}`,
          top: toPx(cursor),
          height: Math.max(20, minutes * config.pxPerMinute),
          startMinutes: cursor,
          endMinutes: start,
          minutes,
        });
      }
      cursor = Math.max(cursor, end);
    }
    if (cursor < rangeEndMinutes) {
      gaps.push({
        kind: 'GAP',
        key: `gap:${cursor}:${rangeEndMinutes}`,
        top: toPx(cursor),
        height: Math.max(20, (rangeEndMinutes - cursor) * config.pxPerMinute),
        startMinutes: cursor,
        endMinutes: rangeEndMinutes,
        minutes: rangeEndMinutes - cursor,
      });
    }
  }

  // Blocks first so they paint above the gaps they sit between.
  return {
    items: [...gaps, ...items],
    /*
     * In stack mode the height is the row count times the step, less the final
     * gap — so the last card's bottom edge is the last pixel of the chart rather
     * than a band of trailing air.
     */
    height: isStacked
      ? Math.max(0, rowCount * step - config.rowGap)
      : toPx(rangeEndMinutes),
    rangeStartMinutes,
    rangeEndMinutes,
    pxPerMinute: config.pxPerMinute,
    heightForMinutes,
    layoutMode: isStacked ? 'stack' : 'time',
    rowHeight: isStacked ? (uniform ?? null) : null,
  };
}

// ============================================================================
// Day summary
// ============================================================================

export interface DayCategoryMix {
  id: string;
  name: string;
  color: string | null;
  minutes: number;
  count: number;
}

export interface DayEnergyMix {
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  minutes: number;
  count: number;
}

export interface DaySummary {
  /** Total scheduled time, counting an overlapping block once per block. */
  scheduledMinutes: number;
  /** Scheduled time for blocks the user asked to have tracked. */
  trackedMinutes: number;
  /**
   * Minutes of the day no block occupies.
   *
   * Computed from the **union** of all block intervals, not by subtracting
   * `scheduledMinutes` from 1440. With two overlapping blocks the naive
   * subtraction produces free time below zero, which is how "free time" became
   * a negative number on any day with a clash.
   */
  freeMinutes: number;
  /** Minutes occupied by at least one block, after de-duplicating overlaps. */
  occupiedMinutes: number;
  longestGap: TimelineGap | null;
  firstStartMinutes: number | null;
  /** Past midnight for a day whose last block is overnight. */
  lastEndMinutes: number | null;
  categoryMix: DayCategoryMix[];
  energyMix: DayEnergyMix[];
  /** Number of *pairs* of overlapping blocks. */
  conflictCount: number;
  blockCount: number;
  trackedCount: number;
}

/** Merge intervals, then measure their total length. */
function unionMinutes(intervals: Interval[]): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [currentStart = 0, currentEnd = 0] = sorted[0] ?? [0, 0];
  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i];
    if (!next) continue;
    if (next[0] <= currentEnd) {
      currentEnd = Math.max(currentEnd, next[1]);
    } else {
      total += currentEnd - currentStart;
      currentStart = next[0];
      currentEnd = next[1];
    }
  }
  return total + (currentEnd - currentStart);
}

/**
 * Aggregate numbers for the day.
 *
 * `completionRate` is deliberately **absent**. There are already three
 * different completion definitions in this app and this module is not where a
 * fourth gets invented; the caller decides which denominator it means and says
 * so in the label.
 */
export function summarizeDay(blocks: readonly ResolvedRoutineBlock[]): DaySummary {
  const ordered = sortBlocks(blocks);
  const summary: DaySummary = {
    scheduledMinutes: 0,
    trackedMinutes: 0,
    freeMinutes: MINUTES_PER_DAY,
    occupiedMinutes: 0,
    longestGap: null,
    firstStartMinutes: null,
    lastEndMinutes: null,
    categoryMix: [],
    energyMix: [],
    conflictCount: 0,
    blockCount: ordered.length,
    trackedCount: 0,
  };

  if (ordered.length === 0) return summary;

  const intervals: Interval[] = [];
  const categoryTotals = new Map<string, DayCategoryMix>();
  const energyTotals = new Map<string, DayEnergyMix>();
  let longestGap: TimelineGap | null = null;

  ordered.forEach((block, index) => {
    const startMinutes = toMinutes(block.startTime);
    const endMinutes = blockEndMinutes(block.startTime, block.endTime);
    const duration = endMinutes - startMinutes;

    summary.scheduledMinutes += duration;
    summary.firstStartMinutes =
      summary.firstStartMinutes === null
        ? startMinutes
        : Math.min(summary.firstStartMinutes, startMinutes);
    summary.lastEndMinutes =
      summary.lastEndMinutes === null
        ? endMinutes
        : Math.max(summary.lastEndMinutes, endMinutes);

    intervals.push(...intervalsFor(block));

    if (block.trackCompletion) {
      summary.trackedMinutes += duration;
      summary.trackedCount += 1;
    }

    if (block.category) {
      const existing = categoryTotals.get(block.category.id);
      if (existing) {
        existing.minutes += duration;
        existing.count += 1;
      } else {
        categoryTotals.set(block.category.id, {
          id: block.category.id,
          name: block.category.name,
          color: block.category.color,
          minutes: duration,
          count: 1,
        });
      }
    }

    if (block.energyLevel === 'HIGH' || block.energyLevel === 'MEDIUM' || block.energyLevel === 'LOW') {
      const existing = energyTotals.get(block.energyLevel);
      if (existing) {
        existing.minutes += duration;
        existing.count += 1;
      } else {
        energyTotals.set(block.energyLevel, {
          level: block.energyLevel,
          minutes: duration,
          count: 1,
        });
      }
    }

    const previous = ordered[index - 1];
    if (previous) {
      const previousEnd = blockEndMinutes(previous.startTime, previous.endTime);
      if (previousEnd < MINUTES_PER_DAY) {
        const gapLength = startMinutes - previousEnd;
        if (gapLength >= 5) {
          const gap: TimelineGap = {
            kind: 'GAP',
            key: `gap:${previous.id}:${block.id}`,
            startMinutes: previousEnd,
            endMinutes: startMinutes,
            minutes: gapLength,
            wrapsMidnight: false,
          };
          if (!longestGap || gap.minutes > longestGap.minutes) longestGap = gap;
        }
      }
    }
  });

  summary.occupiedMinutes = unionMinutes(intervals);
  summary.freeMinutes = MINUTES_PER_DAY - summary.occupiedMinutes;
  summary.longestGap = longestGap;

  // Only the conflicts a user would act on: a clash inside the day's own
  // minutes. Overlaps that only exist because one block wraps past midnight are
  // real but invisible on this rail.
  const conflicts = findConflictMap(ordered);
  for (const ids of conflicts.values()) summary.conflictCount += ids.length;
  summary.conflictCount = Math.floor(summary.conflictCount / 2);

  summary.categoryMix = [...categoryTotals.values()].sort((a, b) => b.minutes - a.minutes);
  summary.energyMix = ['HIGH', 'MEDIUM', 'LOW']
    .map((level) => energyTotals.get(level))
    .filter((entry): entry is DayEnergyMix => entry !== undefined);

  return summary;
}

// ============================================================================
// Now / next
// ============================================================================

export interface NowNext {
  current: TimelineBlock | null;
  next: TimelineBlock | null;
  /** Minutes until `next` starts. `null` when there is no next block. */
  minutesUntilNext: number | null;
  /** Blocks whose end has not passed yet, including the running one. */
  blocksRemaining: number;
  /** True once the day's last block has finished. */
  dayComplete: boolean;
}

/**
 * What is running, what is next, and how much of the day is left.
 *
 * Built from {@link buildTimeline} rather than re-deriving from the blocks, so
 * the rail's "current block" is by construction the same object the timeline
 * renders as CURRENT. The two used to disagree whenever one of them had its own
 * idea of the current time.
 */
export function getNowNext(
  blocks: readonly ResolvedRoutineBlock[],
  nowMinutes: number | null
): NowNext {
  const empty: NowNext = {
    current: null,
    next: null,
    minutesUntilNext: null,
    blocksRemaining: 0,
    dayComplete: false,
  };

  if (blocks.length === 0 || nowMinutes === null) return empty;

  const items = buildTimeline(blocks, nowMinutes);
  const timelineBlocks = items.filter((item): item is TimelineBlock => item.kind === 'BLOCK');

  const current = timelineBlocks.find((item) => item.phase === 'CURRENT') ?? null;
  const next = timelineBlocks.find(
    (item) => item.phase === 'UPCOMING' && item.startMinutes > nowMinutes
  ) ?? null;

  const blocksRemaining = timelineBlocks.filter(
    (item) => item.endMinutes > nowMinutes
  ).length;

  return {
    current,
    next,
    minutesUntilNext: next ? minutesUntilBlock(next.block.startTime, toClock(nowMinutes)) : null,
    blocksRemaining,
    dayComplete: current === null && next === null && blocksRemaining === 0,
  };
}

/** Exposed for tests and for the 24-hour shape bar. */
export { toClock as minutesToClock, toMinutes as clockToMinutes };

