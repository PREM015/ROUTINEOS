'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui';
import {
  buildGanttLayout,
  type GanttBlockItem,
  type GanttGapItem,
} from '@/lib/routine/timeline';
import { formatClockMinutes, formatDuration } from '@/lib/routine/duration';
import { useAnimationsEnabled } from '@/hooks/useAnimationsEnabled';
import { useTimelineScale } from '@/hooks/useTimelineScale';
import { cn } from '@/lib/utils';
import { BlockCard } from '@/components/routine/ScheduleBlock';
import type { ResolvedRoutineBlock } from '@/types/routine';

/**
 * The day, laid out on a real time axis.
 *
 * ## Why the blocks are not a list
 *
 * Every block used to be one fixed-height row in start-time order, so a
 * 30-minute coffee and a three-hour block of deep work looked identical and two
 * overlapping blocks stacked instead of visibly sharing the clock. On a page
 * whose entire subject is time, that is the one thing it must not do.
 *
 * ## Why it is still not a library counter
 *
 * A strict lane grid — equal-height shelves in columns — is the obvious fix and
 * the wrong one: it turns a day into a filing cabinet. So the axis is
 * time-accurate (a block is as tall as it is long) but the treatment is
 * deliberately organic:
 *
 *  - blocks are capsules with a soft, offset gradient edge rather than rectangles
 *  - lanes are staggered with rounded, inset cards instead of hard columns
 *  - the rail is a soft gradient that glows where the current block sits on it
 *  - the running block lifts off the rail with a halo, so "now" is found by
 *    looking rather than by reading
 *  - gaps are breathing space with a dashed wisp, not an empty cell
 *
 * A single-lane day — which is most days — gets full width and no column
 * structure at all, so the layout only becomes a grid when the user's own
 * schedule actually overlaps.
 *
 * ## No props or callbacks changed
 * Layout only. Every action below is the same callback the flat list called.
 */

/**
 * The scrollable day area.
 *
 * `flex-1` makes it fill the panel it is given, so a three-block day occupies
 * the column instead of ending mid-screen with a dead band beneath it. `max-h`
 * then caps a long day, and `min-h` stops a sparse day collapsing to a strip.
 *
 * All three bounds live here rather than on an ancestor's `items-start`, which
 * is what produced the empty space originally: that stops the *grid* stretching
 * its columns, so the panel only ever grows to its content's height no matter
 * how tall its neighbour is.
 *
 * `100dvh` rather than `100vh`: `vh` is the *largest* viewport, so on mobile it
 * includes the space under the retracting URL bar and the bottom of the timeline
 * ends up behind the browser chrome. `dvh` tracks the real visible height.
 *
 * ## Why there is no `max-h` here any more
 *
 * The cap was this element's own idea of how tall it was allowed to be, and it
 * was the source of the dead space: a day whose blocks were shorter than the cap
 * left the remainder as black, and a day longer than the cap scrolled inside a box
 * that was itself floating in an even larger page scroll.
 *
 * The height is now bounded by the *parent* — the panel is stretched to the
 * viewport and this fills it — so there is nothing for a cap to guess at. `h-full`
 * plus `min-h-0` is what lets a flex child actually take its parent's height
 * instead of growing to its content; without `min-h-0` the content wins and the
 * overflow moves to the page.
 *
 * `min-h-[26rem]` is the floor for a genuinely sparse day, so three blocks do not
 * collapse into a strip. It is a minimum, never a maximum.
 */
/**
 * The schedule pane: scrolls vertically, never horizontally, and carries a
 * visible slim scrollbar.
 *
 * `pr-3` rather than `pr-1`, because the `.scrollbar-slim` thumb is 8px wide and
 * a 4px gutter left it sitting almost on top of the right-hand card's edge — it
 * read as part of the card rather than as a scroll control. 12px of padding puts
 * a clear channel between the two.
 *
 * `overflow-x-hidden` because a horizontal scrollbar here would be pure loss:
 * there is nothing to scroll to. Every block is `width: calc(1/laneCount * 100%
 * - 12px)`, so the content is always narrower than the pane.
 */
/**
 * Breathing room above the first block and below the last.
 *
 * `pt-8` / `pb-12` in Tailwind, restated in pixels because the inner content div
 * carries an explicit `height` from the layout engine and the padding has to be
 * added to it by hand — padding inside a fixed-height box does not make the box
 * taller, so without this the last block would be flush against the bottom and
 * the bottom padding would be clipped away entirely.
 *
 * The asymmetry is deliberate. 32px above is enough to separate the first block
 * from the day-type strip; 48px below is enough that the last block never looks
 * pressed against the shortcut dock, which is a fixed control the reader is
 * looking at rather than part of the list.
 */
const CANVAS_PADDING_PX = 32 + 48;

const SCROLL_AREA =
  'group/timeline scrollbar-slim relative h-full min-h-0 flex-1 overflow-x-hidden ' +
  'overflow-y-auto overscroll-contain pr-3';

/**
 * The width of the hour-label gutter every row starts at.
 *
 * ## Why one constant
 *
 * This number was previously written into three separate class strings — the
 * rail, the now marker and the gap ribbons. Any change to one of them left the
 * others behind, which is exactly how the now line ended up floating beside the
 * grid axis instead of on it: the axis moved, the marker did not.
 *
 * Applied through `style` rather than a `pl-[46px]` class on purpose. A Tailwind
 * arbitrary value has to appear as a literal in the source for the scanner to
 * generate it, so building the class from a constant would compile to nothing and
 * silently collapse the gutter. `style` cannot fail that way.
 */
const GUTTER_PX = 46;

/** `paddingLeft` for content that starts after the hour labels. */
const gutter = { paddingLeft: GUTTER_PX } as const;

/** `left` for a rule that runs down the axis itself. */
const axisLeft = { left: GUTTER_PX } as const;

export function RoutineTimeline({
  blocks,
  nowMinutes,
  isToday,
  timeFormat24h,
  readOnly,
  busyBlockIds,
  onToggleDone,
  onStart,
  onDetails,
  onEdit,
  onDuplicate,
  onNudge,
  onDelete,
  onFillGap,
}: {
  blocks: ResolvedRoutineBlock[];
  nowMinutes: number | null;
  isToday: boolean;
  timeFormat24h: boolean;
  readOnly: boolean;
  busyBlockIds: readonly string[];
  onToggleDone: (block: ResolvedRoutineBlock) => void;
  onStart: (block: ResolvedRoutineBlock) => void;
  onDetails: (block: ResolvedRoutineBlock) => void;
  onEdit: (block: ResolvedRoutineBlock) => void;
  onDuplicate: (block: ResolvedRoutineBlock) => void;
  onNudge: (block: ResolvedRoutineBlock, deltaMinutes: number) => void;
  onDelete: (block: ResolvedRoutineBlock) => void;
  onFillGap: (startTime: string, endTime: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  /*
   * The scale is measured from the container, so the same day reads well on a
   * 360px phone and a 1440px desktop. It has to be known before the layout is
   * derived, which is why this is a hook rather than a CSS media query — see
   * `useTimelineScale`.
   */
  const scale = useTimelineScale(scrollRef);
  const layout = buildGanttLayout(blocks, isToday ? nowMinutes : null, scale);
  const currentRef = useRef<HTMLDivElement>(null);
  const [jumpVisible, setJumpVisible] = useState(false);
  const reduceMotion = useReducedMotion();
  // Stagger once on mount and once per date change, never on every clock tick:
  // a re-staggering timeline would make the minute tick feel like a glitch.
  const [stagger, setStagger] = useState(true);
  useEffect(() => {
    setStagger(true);
    const timer = setTimeout(() => setStagger(false), 900);
    return () => clearTimeout(timer);
  }, [layout.rangeStartMinutes, layout.rangeEndMinutes]);

  /**
   * Cursor-following spotlight.
   *
   * Two CSS custom properties written on one container, read only by the
   * spotlight element's own gradient. No React state, so moving the pointer
   * across the day costs two property writes rather than a re-render of every
   * block — which matters here because a clock tick already re-renders this
   * subtree once a minute and this must not add to it.
   */
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      '--spot-x',
      `${((event.clientX - box.left) / box.width) * 100}%`
    );
    event.currentTarget.style.setProperty(
      '--spot-y',
      `${((event.clientY - box.top) / box.height) * 100}%`
    );
  }, []);

  const onScroll = useCallback(() => {
    const container = scrollRef.current;
    const current = currentRef.current;
    if (!container || !current) return;
    const containerBox = container.getBoundingClientRect();
    const currentBox = current.getBoundingClientRect();
    setJumpVisible(
      currentBox.top < containerBox.top || currentBox.bottom > containerBox.bottom
    );
  }, []);

  const jumpToNow = useCallback(() => {
    currentRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  const gapItems = layout.items.filter((item): item is GanttGapItem => item.kind === 'GAP');
  const blockItems = layout.items.filter((item): item is GanttBlockItem => item.kind === 'BLOCK');
  // The current block the now line is inside, for the marker's settle key.
  const currentBlock = blockItems.find((item) => item.phase === 'CURRENT') ?? null;

  return (
    /*
     * `flex min-h-0 flex-1 flex-col` is the load-bearing element in the whole
     * viewport chain, and it was a plain `relative` block until now.
     *
     * The panel is a flex column, so this root is a flex item — and a flex item
     * defaults to `flex: 0 1 auto` with `min-height: auto`, which means it sizes
     * to its own content and refuses to shrink. Two consequences followed from
     * that single missing class:
     *
     *  1. The scroll area's `h-full` resolved against a *content-height* parent,
     *     so it constrained nothing and never became a scrollport. The blocks did
     *     not scroll; they simply accumulated, and the panel grew past the
     *     viewport until the page itself scrolled.
     *  2. The shortcut dock, being the last child of that overflowing column, sat
     *     *after the final block* rather than at the bottom of the panel. It read
     *     as the last row of the schedule instead of as a fixed control.
     *
     * `flex-1` makes the root take the panel's height, `min-h-0` lets it shrink
     * below its content, and `flex-col` gives the scroll area a definite parent to
     * be `flex-1` against. With that, the scroll area scrolls and the dock is
     * pinned where it belongs.
     */
    <div className="relative flex min-h-0 flex-1 flex-col">
      {jumpVisible && (
        <Button
          variant="secondary"
          size="sm"
          onClick={jumpToNow}
          // Glass, because this button floats *over* the schedule rather than
          // beside it. A flat `secondary` fill over a glass capsule gave it no
          // edge and it read as a rendering artefact; the blur separates it from
          // whatever block happens to be underneath without a hard border, and
          // `aria-live` announces it because it appears without being asked for.
          className="absolute right-2 top-2 z-30 border border-border/70 bg-background/80 shadow-floating backdrop-blur-md"
        >
          <ArrowDown size={13} />
          Jump to now
        </Button>
      )}

<div
        ref={scrollRef}
        onScroll={onScroll}
        onPointerMove={onPointerMove}
        className={SCROLL_AREA}
        style={
          {
            '--spot-x': '50%',
            '--spot-y': '50%',
          } as React.CSSProperties
        }
      >
        <div
          className="relative px-1 pt-8 pb-12"
          style={{ height: layout.height + CANVAS_PADDING_PX }}
        >
          {/*
            The time axis exists only in `'time'` mode.

            In `'stack'` mode the vertical position of a block is its place in
            the day's sequence, not its time — a 4-hour block and a 15-minute one
            are the same height. Drawing hour ticks down the left of that would be
            a ruler beside a list in which 09:00 sits above 14:00: a confident,
            precise, wrong answer. So the grid, the rail and the gaps are all
            suppressed, and the only clock on the page is the one inside each row.
          */}
          {layout.layoutMode === 'time' && (
            <>
              {/* Hour ticks, on the same scale as the blocks. */}
              <HourGrid
                from={layout.rangeStartMinutes}
                to={layout.rangeEndMinutes}
                pxPerMinute={layout.pxPerMinute}
                timeFormat24h={timeFormat24h}
              />

              {/* The rail: a soft gradient that brightens toward "now". */}
              <Rail
                rangeStart={layout.rangeStartMinutes}
                rangeEnd={layout.rangeEndMinutes}
                nowMinutes={isToday ? nowMinutes : null}
              />
            </>
          )}

          {/*
            The now line.

            In `'time'` mode it is placed by the clock. In `'stack'` mode there is
            no clock scale to place it on, so it is pinned to the top edge of the
            row holding the current block — which is the only position that is
            both truthful and useful, and it is why "jump to now" still lands on
            the right card.
          */}
          {isToday &&
            nowMinutes !== null &&
            nowMinutes >= layout.rangeStartMinutes &&
            (layout.layoutMode === 'time' ? (
              <NowMarker
                top={(nowMinutes - layout.rangeStartMinutes) * layout.pxPerMinute}
                clock={formatClockMinutes(nowMinutes, timeFormat24h)}
                // The current block's identity, so the settle re-runs on a
                // boundary crossing rather than only when the minute changes.
                settleKey={currentBlock?.block.id ?? null}
              />
            ) : currentBlock ? (
              <NowMarker
                top={currentBlock.top}
                clock={formatClockMinutes(nowMinutes, timeFormat24h)}
                settleKey={currentBlock.block.id}
              />
            ) : null)}

          {/* Gaps first so blocks paint over their edges. Emitted in time mode only. */}
          {gapItems.map((gap) => (
            <GapRibbon key={gap.key} gap={gap} onFill={onFillGap} disabled={readOnly} />
          ))}

          {blockItems.map((item, index) => (
            <motion.div
              key={item.key}
              ref={item.phase === 'CURRENT' ? currentRef : undefined}
              className="absolute"
              style={{
                top: item.top,
                height: item.height,
                /*
                  `lane` and `laneCount` are both per-block, from the engine's own
                  overlap analysis for *this* block's span. The previous code used
                  one `laneCount` for the whole day — the maximum anywhere — so a
                  single overlapping pair compressed every unrelated block to a
                  fraction of the width, and an evening of back-to-back blocks that
                  clashed with nothing rendered as a stack of half-width slivers.

                  Two overlaps give `1/2` each; three give `1/3`; a block with no
                  neighbours gives `1/1` and spans the container.
                */
                left: `calc(${(item.lane / item.laneCount) * 100}% + 6px)`,
                width: `calc(${(1 / item.laneCount) * 100}% - 12px)`,
              }}
              // Staggered rise, once. The delay is capped so a twenty-block day
              // does not take four seconds to finish appearing.
initial={stagger && !reduceMotion ? { opacity: 0, y: 10, scaleY: 0.96 } : false}
              animate={{ opacity: 1, y: 0, scaleY: 1 }}
              transition={{
                duration: reduceMotion ? 0 : 0.34,
                delay: reduceMotion ? 0 : Math.min(index * 0.04, 0.4),
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <BlockCard
                item={item}
                timeFormat24h={timeFormat24h}
                readOnly={readOnly}
                busy={busyBlockIds.includes(item.block.id)}
                onToggleDone={onToggleDone}
                onStart={onStart}
                onDetails={onDetails}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onNudge={onNudge}
onDelete={onDelete}
              />
            </motion.div>
          ))}

          {/* Pointer spotlight. Decorative and behind everything. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-0 opacity-0 transition-opacity duration-300 group-hover/timeline:opacity-100"
            style={{
              background:
                'radial-gradient(420px circle at var(--spot-x) var(--spot-y), color-mix(in oklab, var(--primary) 9%, transparent), transparent 70%)',
            }}
          />
        </div>
      </div>

      {/*
        The shortcut bar, OUTSIDE the scroll container.

        It used to sit inside, which meant it scrolled away with the day: after
        the first minute of scrolling the affordance was simply gone, and while
        it was still visible it hovered over whichever block happened to be under
        it. Moving it out and pinning it to the bottom of the card means the
        shortcuts are always on screen while the timeline is being read, and they
        never occlude content.
      */}
      <ShortcutHint />
    </div>
  );
}

// ============================================================================

/** Hour labels and gridlines, on the block scale. */
function HourGrid({
  from,
  to,
  pxPerMinute,
  timeFormat24h,
}: {
  from: number;
  to: number;
  pxPerMinute: number;
  timeFormat24h: boolean;
}) {
  const hours = [];
  const firstHour = Math.ceil(from / 60);
  for (let hour = firstHour; hour * 60 <= to; hour += 1) {
    const minutes = hour * 60;
    if (minutes < from) continue;
    hours.push(minutes);
  }

  return (
    <>
      {hours.map((minutes) => (
        <div
          key={minutes}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0"
          style={{ top: (minutes - from) * pxPerMinute }}
        >
          <div className="flex items-center gap-3">
            <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground/70">
              {formatClockMinutes(minutes, timeFormat24h)}
            </span>
            <span className="h-px flex-1 bg-border/50" />
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * The spine.
 *
 * A gradient rather than a flat 1px line: it fades in at the top, brightens
 * toward the current time and fades out at the bottom, so the rail reads as
 * having a direction and "now" is legible from the rail alone.
 */
function Rail({
  rangeStart,
  rangeEnd,
  nowMinutes,
}: {
  rangeStart: number;
  rangeEnd: number;
  nowMinutes: number | null;
}) {
  const nowPercent =
    nowMinutes === null || nowMinutes <= rangeStart
      ? null
      : Math.min(100, ((nowMinutes - rangeStart) / (rangeEnd - rangeStart)) * 100);

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 top-0 w-px"
      style={{
        ...axisLeft,
        // `--accent-routine` rather than `--primary`. This is the routine page's
        // own identity hue (sky) and it was defined all along but referenced
        // nowhere in `components/routine/**` — so the now line was green while
        // every block around it wore its own colour. One hue for "where the day
        // is now", distinct from "which kind of block is this".
        background: nowPercent
          ? `linear-gradient(to bottom, transparent 0%, var(--border) 12%, var(--accent-routine) ${nowPercent}%, var(--accent-routine) ${nowPercent}%, var(--border) ${Math.min(100, nowPercent + 6)}%, transparent 100%)`
          : 'linear-gradient(to bottom, transparent 0%, var(--border) 15%, var(--border) 85%, transparent 100%)',
      }}
    />
  );
}

/**
 * The live now marker.
 *
 * ## The settle
 *
 * `top` is derived from the clock, and the clock only moves once a minute, so
 * the marker's own tick is a 3px step nobody can see. The jumps that *are*
 * visible are the discrete ones: the user changing date, which re-derives
 * `rangeStartMinutes` and can move the line most of the way up the chart, and
 * the moment the current block rolls over.
 *
 * So the position animates over 150ms. That is a settle, not a glide — a glide
 * would imply the line is *following* something, and the whole point of a now
 * line is that it does not lag behind the clock. 150ms is short enough that the
 * line reads as snapping into place and long enough that the jump is not a cut.
 *
 * ## Why `top` and not a transform
 *
 * Animating `top` is a layout/paint property, and the rest of this timeline
 * keeps its motion on transforms and opacity for that reason. The exception is
 * deliberate: there is exactly **one** now marker, on its own layer, and nothing
 * else reflows when it moves. Compositing a transform here would buy nothing
 * and cost the `translateY(-50%)` centring that positions the line on its own
 * `top` in the first place. The fifteen capsules are where that rule earns its
 * keep, and they obey it.
 *
 * `settleKey` is passed through for the reduced-motion case and for callers that
 * want to force a re-settle; it is not used as a React `key`, because changing
 * the key would remount the element and skip the animation entirely.
 */
function NowMarker({
  top,
  clock,
  settleKey,
}: {
  top: number;
  clock: string;
  /** Identity of the current block; changes when the marker crosses a boundary. */
  settleKey: string | null;
}) {
  const animationsEnabled = useAnimationsEnabled();

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-20"
      // The centring offset is a fixed fraction of the marker's own height, so
      // it lives in the transform and never fights the animated `top`.
      style={{ top, translateY: '-50%' }}
      initial={false}
      animate={{ top }}
      transition={
        animationsEnabled
          ? { duration: 0.15, ease: [0.22, 1, 0.36, 1] }
          : { duration: 0 }
      }
      // Referenced so the settle re-runs if the block changes while `top` happens
      // to be unchanged (a zero-length block, or a sub-pixel minute step).
      data-settle-key={settleKey ?? undefined}
    >
      <div className="flex items-center gap-2" style={gutter}>
        {/*
          The marker's dot, pill and ping all wear `--accent-routine`.

          They were `--primary`, so the "now" marker read as a green blob sitting
          on top of a column of multi-coloured blocks — the one element on the
          page that belonged to no block. Tying it to the page's own identity hue
          keeps it legible as "the clock", and the vertical line above already
          matches.
        */}
        <span className="relative -ml-[5px] flex h-2.5 w-2.5">
          {animationsEnabled ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-routine opacity-60" />
          ) : null}
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-routine shadow-[0_0_12px_var(--accent-routine)]" />
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-accent-routine/70 to-transparent" />
        {/*
          Foreground is `--card`, not `primary-foreground`. `--accent-routine` is
          a mid sky blue in light mode and a light sky blue in dark, and pairing
          it with a fixed near-white foreground in dark mode would sit around
          2:1. Mixing toward the card keeps the label dark-on-light in one theme
          and light-on-dark in the other without a second branch.
        */}
        <span
          className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums shadow-soft"
          style={{
            background: 'var(--accent-routine)',
            color: 'var(--card)',
          }}
        >
          {clock}
        </span>
      </div>
    </motion.div>
  );
}

/** Free space, drawn as breathing room with a dashed wisp. */
function GapRibbon({
  gap,
  onFill,
  disabled,
}: {
  gap: GanttGapItem;
  onFill: (start: string, end: string) => void;
  disabled?: boolean;
}) {
  const start = formatClockMinutes(gap.startMinutes);
  const end = formatClockMinutes(gap.endMinutes);

  return (
    <div
      className="absolute inset-x-0"
      style={{ top: gap.top, height: gap.height }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onFill(start, end)}
        aria-label={`Add a block in the ${formatDuration(gap.minutes)} free gap, ${start} to ${end}`}
        className={cn(
          'group flex h-full w-full items-center gap-3 pr-2 text-left',
          'transition-colors hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50'
        )}
        // Same gutter as the rail and the now marker, so a gap's wisp starts on
        // the axis rather than 46px to its left.
        style={gutter}
      >
        <span className="h-px flex-1 border-t border-dashed border-border/70 transition-colors group-hover:border-primary/50" />
        <span
          className={cn(
            'shrink-0 rounded-full bg-card px-2 py-0.5 text-[11px] font-medium tabular-nums',
            'text-muted-foreground ring-1 ring-border/70 transition-all',
            'group-hover:text-primary group-hover:ring-primary/40'
          )}
        >
          {formatDuration(gap.minutes)} free
        </span>
      </button>
    </div>
  );
}

// ============================================================================

/** Keyboard hints. Always visible, never a modal. */
/**
 * The keyboard shortcut dock.
 *
 * A **flex sibling** of the scroll area, not a `sticky` overlay and not inside
 * the scroll container. Both of those were tried and both were wrong:
 *
 *  - inside the scroll container it scrolled away with the day, so the
 *    affordance disappeared after the first minute of reading, and
 *  - as `sticky bottom-0` over the scroll area it painted on top of the last
 *    card, which is what made `Breakfast` look clipped.
 *
 * `shrink-0` is what keeps it from being squeezed when the panel is short: a
 * flex item's default `min-height: auto` would let the scroll area push it out
 * of the panel entirely, and `shrink-0` guarantees the dock always has its row.
 *
 * The background is translucent with a blur rather than a solid fill, because the
 * card behind it is itself glass and a flat surface would stack two opaque layers
 * and kill the translucency the page is built on.
 */
function ShortcutHint() {
  return (
    <div className="z-20 -mx-4 mt-1 shrink-0 border-t border-border/60 bg-background/85 px-4 py-2 backdrop-blur-md sm:-mx-5 sm:px-5">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          <kbd className="rounded border border-border bg-muted px-1 font-mono">N</kbd> new block
        </span>
        <span>
          <kbd className="rounded border border-border bg-muted px-1 font-mono">T</kbd> jump to
          now
        </span>
        <span className="flex items-center">
          <kbd className="rounded border border-border bg-muted px-1 font-mono">←</kbd>
          <kbd className="ml-0.5 rounded border border-border bg-muted px-1 font-mono">→</kbd>
          change day
        </span>
      </p>
    </div>
  );
}
