'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PACE_COLOR, PACE_WASH, wedgeOpacity } from '@/constants/goals';
import { EASE } from '@/lib/motion';
import {
  paceLabel,
  paceSummary,
  type GoalPace,
} from '@/lib/goals/goal-metrics';

/** Clamp a share into 0..1, mapping non-finite input to 0. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * ## The Pace Track — the page's signature device
 *
 * A horizontal band carrying **two** marks:
 *
 * ```
 *   start ┃━━━━━━━━━━━━━━━━━┃━━━━━━━━━━━━━━━━━━━━━━━━┃ end
 *         └─ elapsed ─┘     └─────── remaining ─────┘
 *                    ▲ ghost                 ▲ solid
 *              where you should be     where you actually are
 * ```
 *
 * - The **ghost marker** sits at `elapsedShare`: where progress would be if it
 *   moved in perfect lockstep with the calendar. It barely moves as time passes,
 *   which is exactly right — it is the boring reference line, and an instrument
 *   whose reference wanders is not an instrument.
 * - The **solid marker** sits at `progressShare`: where the user actually is.
 * - The **gap wedge** between them *is* the pace. It is the one subtraction
 *   (`progressShare − elapsedShare`) drawn, tinted and tapered by how far behind
 *   the goal falls.
 *
 * This replaces "73% complete" — a number that says nothing about whether 73% is
 * good — with "73% complete, and today you should be at 61%". It cannot show
 * something the maths does not mean, because both positions are the shares
 * `computeGoalPace` already returns.
 *
 * ### Why absolutely-positioned marks and not an SVG
 *
 * Two markers and one wedge are three boxes. An SVG would need viewBox maths,
 * a `preserveAspectRatio` decision and manual text placement for no benefit, and
 * it cannot be animated with `transform` on a single compositor layer as cheaply
 * as three divs can. The wedge animates `scaleX`, which stays off layout and off
 * paint.
 *
 * ### Geometry
 *
 * Positions are percentages of the track width. Everything is clamped into
 * `[0, 1]` upstream in `computeGoalPace`, so a goal that is 118% complete or one
 * whose window has closed both resolve to sane marks rather than escaping the
 * band — an overhanging marker would read as a second data point that does not
 * exist.
 */

export interface PaceTrackProps {
  pace: GoalPace;
  /**
   * The goal's title.
   *
   * Present so the `aria-valuetext` reads as a sentence rather than a bare
   * figure. The track has no visual title of its own — the card above it does —
   * so without this the accessible name would be "73% of target reached", which
   * is true of every goal on the page and therefore identifies nothing.
   */
  title: string;
  /** Renders the numeric pair beside the track. */
  showValues?: boolean;
  /** Compact form for dense lists: no numbers, no padding. */
  compact?: boolean;
  className?: string;
}

export function PaceTrack({ pace, title, showValues = false, compact = false, className }: PaceTrackProps) {
  const reduced = useReducedMotion();

  const progress = clamp01(pace.progressShare);
  const elapsed = clamp01(pace.elapsedShare);

  const solid = PACE_COLOR[pace.state];
  const wash = PACE_WASH[pace.state];
  const alpha = wedgeOpacity(pace.state, pace.gapPoints);

  /**
   * The wedge is the interval *between* the two markers, so it has to start at
   * whichever is leftmost and end at whichever is rightmost. It is not
   * direction-aware: an ahead goal's wedge reads the same shape as a behind
   * goal's, and only the tint separates them. That is a deliberate restraint —
   * a chevron pointing one way or the other would add a second, redundant
   * encoding of a direction the colour already carries.
   */
  const wedgeLeft = Math.min(progress, elapsed);
  const wedgeWidth = Math.abs(progress - elapsed);

  /**
   * An unstarted or inactive goal renders as a dashed rail with no markers at
   * all. Drawing a marker at 0 for a goal that has not begun would imply a
   * measurement was taken.
   */
  const inert = pace.isNotStarted || pace.state === 'inactive';

  const label = paceSummary(pace);

  /**
   * Spoken form of the whole device in one string: what, where you are, where
   * you should be, and therefore how you are doing.
   */
  const accessible = [
    pace.state === 'done' ? `${title}: completed` : title,
    pace.hasNoTarget
      ? 'no target set'
      : `${Math.round(progress * 100)}% of target reached`,
    `${Math.round(elapsed * 100)}% of the schedule elapsed`,
    label ?? paceLabel(pace.state),
  ].join('. ');

  return (
    <div className={cn('w-full', className)}>
      {(showValues || compact) && (
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span
            className={cn(
              'font-display text-sm tabular-nums',
              pace.hasNoTarget ? 'text-muted-foreground' : 'text-foreground'
            )}
          >
            {pace.hasNoTarget ? 'No target set' : `${Math.round(progress * 100)}%`}
          </span>
          <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            {paceLabel(pace.state)}
          </span>
        </div>
      )}

      <div
        className={cn(
          'relative w-full overflow-hidden rounded-full',
          compact ? 'h-1.5' : 'h-2.5'
        )}
        style={{ background: 'var(--pace-rail)' }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={accessible}
        aria-label={`Trajectory: ${accessible}`}
      >
        {/*
          The gap wedge. `transform: scaleX` from a left origin, so it animates
          without touching layout — animating `width` on a list this long would
          relayout every row on every progress write.
        */}
        {wedgeWidth > 0.001 && !inert && (
          <motion.div
            className="absolute inset-y-0"
            style={{
              left: `${wedgeLeft * 100}%`,
              width: `${wedgeWidth * 100}%`,
              transformOrigin: 'left center',
              background: wash,
              opacity: alpha,
              // A soft taper across the wedge: dense at the marker that is "wrong"
              // and fading toward the reference, so the eye is pulled to the
              // discrepancy rather than to the band as a whole.
              maskImage:
                'linear-gradient(to right, transparent 0%, black 35%, black 100%)',
              WebkitMaskImage:
                'linear-gradient(to right, transparent 0%, black 35%, black 100%)',
            }}
            initial={reduced ? false : { scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: alpha }}
            transition={{ duration: reduced ? 0 : 0.55, ease: EASE }}
            aria-hidden="true"
          />
        )}

        {/*
          The completed span, from the start of the track to the solid marker.
          This is the "where you actually are" fill. It is separate from the
          wedge: the wedge explains the *difference*, this is the *fact*.
        */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${progress * 100}%`,
            transformOrigin: 'left center',
            background: solid,
            opacity: inert ? 0.25 : 0.9,
          }}
          initial={reduced ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: reduced ? 0 : 0.55, ease: EASE }}
          aria-hidden="true"
        />

        {/* Ghost marker: the honest, boring reference line. */}
        {!inert && (
          <motion.span
            aria-hidden="true"
            className="absolute inset-y-0 w-px -translate-x-1/2"
            style={{ left: `${elapsed * 100}%`, background: 'var(--pace-rail-inset)' }}
            initial={reduced ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: reduced ? 0 : 0.45, ease: EASE, delay: reduced ? 0 : 0.1 }}
          />
        )}

        {/* Solid marker head: the actual position, with a ring so it stays legible on the fill. */}
        {!inert && (
          <motion.span
            aria-hidden="true"
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
            style={{
              left: `${progress * 100}%`,
              width: compact ? 8 : 10,
              height: compact ? 8 : 10,
              borderColor: solid,
              background: 'var(--card)',
              boxShadow: `0 0 0 1px ${solid}22`,
            }}
            initial={reduced ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              duration: reduced ? 0 : 0.4,
              ease: EASE,
              delay: reduced ? 0 : 0.25,
            }}
          />
        )}

        {/*
          Overdue is an outline, never a fill. The window has closed and the
          target was not reached — that is a fact about the record, so it is drawn
          as a hairline around the whole band rather than painted over it.
        */}
        {pace.state === 'overdue' && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full border"
            style={{ borderColor: solid, borderWidth: 1 }}
          />
        )}

        {/*
          Inert states: a dashed outline. `not_applicable`, `pending` and
          `inactive` share one treatment because they are the same claim —
          "no measurement to report" — and a goal that had not started should not
          be drawn as if it had been sampled and found empty.
        */}
        {inert && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full border border-dashed"
            style={{ borderColor: 'var(--pace-idle)' }}
          />
        )}
      </div>

      {/*
        The pace sentence. Rendered as text at all times rather than only in a
        tooltip: colour is never the sole carrier of a state (WCAG 1.4.1), and a
        hover-only tooltip is unavailable to touch and to screen readers alike.
      */}
      {label && !compact && (
        <p className="mt-1.5 text-[11px] leading-tight text-muted-foreground">{label}</p>
      )}
    </div>
  );
}