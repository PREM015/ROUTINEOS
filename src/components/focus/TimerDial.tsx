'use client';

/**
 * TimerDial — the single focal point of `/focus`.
 *
 * ## Why this is the only component that subscribes to the clock
 *
 * The old `FocusTimer` held the tick in component state, so the *entire* 1,500-line
 * component — dial, mode tabs, presets, settings card, laps list and 100-row
 * history — re-rendered five times a second. The dial is the only thing that
 * displays the ticking value, so it is the only thing that subscribes.
 *
 * `useFocusNow` returns a shared number rather than owning an interval, so the
 * dial costs one subscription and the rest of the page costs none.
 *
 * ## Why the ring is thinner and quieter
 *
 * The previous dial stacked a dashed spinner circle, 60 tick marks, a gradient
 * ring and an SVG `feGaussianBlur` "neon glow" filter. The glow filter is the
 * expensive part: an SVG filter is re-rasterised on every frame the ring moves,
 * which on a 288 px ring at 4 Hz is enough to matter on a low-end laptop, and it
 * made a tool meant to be calm look like a game HUD. What remains is one thin
 * stroke whose `stroke-dashoffset` is the only thing that changes.
 */

import { memo } from 'react';

import { cn } from '@/lib/utils';
import { useFocusNow } from '@/hooks/useFocusNow';
import { useFocusStore, isLive } from '@/store/focus.store';
import {
  elapsedMs,
  formatClock,
  formatStopwatch,
  progressFraction,
  remainingMs,
} from '@/lib/focus/timer-machine';

/** Geometry. One ring, sized so it works from 240 px to 360 px via CSS. */
const VIEWBOX = 280;
const CENTER = VIEWBOX / 2;
const TRACK_RADIUS = 118;
const STROKE = 6;
const CIRCUMFERENCE = 2 * Math.PI * TRACK_RADIUS;

/**
 * Announced at most once a minute.
 *
 * `aria-live="polite"` on a per-second value is unusable with a screen reader: it
 * interrupts whatever is being read, four hundred times over a 25-minute block.
 * The live region therefore carries the minute, and the dial's own `aria-label`
 * carries the precise value for anyone who navigates to it deliberately.
 */
function announceMinute(remaining: number, paused: boolean): string {
  if (paused) return 'Timer paused';
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes === 0) return 'Less than a minute remaining';
  return `${minutes} minute${minutes === 1 ? '' : 's'} remaining`;
}

/**
 * The text equivalent of the dial's arc.
 *
 * The arc's sweep is a purely visual encoding - `stroke-dashoffset` carries the
 * progress and nothing else does - so without this a screen-reader user knows how much
 * time is left but never how far through the block they are.
 *
 * Spoken as a rounded ten, because that is a stable string while the arc creeps and
 * "0.73 of the timebox" is not something anyone says. A stopwatch has no planned
 * length, so the fraction is meaningless there and this returns `null`.
 *
 * Exported for tests: it is pure arithmetic over the clock, which is the part most
 * likely to regress.
 */
export function describeProgress(fraction: number, isStopwatch: boolean): string | null {
  if (isStopwatch) return null;
  if (!Number.isFinite(fraction)) return null;
  if (fraction >= 0.995) return 'Timebox complete';
  if (fraction <= 0.005) return 'Just started';
  return `About ${Math.round((fraction * 100) / 10) * 10} percent of the timebox elapsed`;
}

export interface TimerDialProps {
  className?: string;
}

function TimerDialImpl({ className }: TimerDialProps) {
  const status = useFocusStore((s) => s.status);
  const mode = useFocusStore((s) => s.mode);
  const startedAt = useFocusStore((s) => s.startedAt);
  const endsAt = useFocusStore((s) => s.endsAt);
  const pausedAt = useFocusStore((s) => s.pausedAt);
  const pausedTotalMs = useFocusStore((s) => s.pausedTotalMs);
  const plannedMs = useFocusStore((s) => s.plannedMs);

  const live = isLive(status);
  const now = useFocusNow(live);

  const state = { startedAt, endsAt, pausedAt, pausedTotalMs, plannedMs } as Parameters<
    typeof remainingMs
  >[0];

  const isStopwatch = mode === 'stopwatch';
  const remaining = remainingMs(state, now);
  const elapsed = elapsedMs(state, now);
  const fraction = progressFraction(state, now);

  const display = isStopwatch
    ? formatStopwatch(elapsed)
    : formatClock(remaining, plannedMs >= 60 * 60_000);

  // Announced only on whole-minute boundaries, so the string changes 25 times in
  // a 25-minute block rather than 1,500 times.
  const announcement =
    !live ? 'Timer ready' : status === 'paused' ? announceMinute(remaining, true) : announceMinute(remaining, false);

  const statusWord =
    status === 'running' ? (isStopwatch ? 'Running' : 'Focusing') : status === 'paused' ? 'Paused' : 'Ready';

  /*
   * The arc's sweep is a purely visual encoding: `stroke-dashoffset` carries the
   * progress and nothing else does. The `aria-label` below names the remaining time,
   * which a screen reader gets, but "how far through the block am I" was only ever
   * available to someone looking at the dial. See `describeProgress`.
   */
  const progressAlt = describeProgress(fraction, isStopwatch);

  /*
   * Mode identity dot: a small filled circle at the center of the ring whose colour
   * names the current mode. Rose = Focus (the domain accent), Green = any break,
   * Neutral = stopwatch or idle.
   *
   * Transitions smoothly between modes via `focus-mode-dot` in globals.css.
   * No interval, no extra render — read from the store, re-rendered only when
   * the mode changes.
   */
  const dotColor =
    mode === 'focus'
      ? 'var(--accent-focus)'
      : mode === 'short-break' || mode === 'long-break'
        ? 'var(--accent-habits)'
        : 'var(--muted-foreground)';

  const dotOpacity = status === 'idle' ? 0.35 : status === 'paused' ? 0.5 : 0.85;

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* The text equivalent of the arc. Visually hidden, but present for anyone
          reading the page rather than looking at it. */}
      {progressAlt && <span className="sr-only">{progressAlt}</span>}
      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          className="h-[min(72vw,20rem)] w-[min(72vw,20rem)] -rotate-90 sm:h-80 sm:w-80"
          role="img"
          aria-label={`${mode === 'focus' ? 'Focus' : mode.replace('-', ' ')} timer, ${display} ${isStopwatch ? 'elapsed' : 'remaining'}${progressAlt ? `, ${progressAlt}` : ''}`}
        >
          {/* Track. `data-focus-dial-track` is what the forced-colors block in
              `globals.css` targets: in High Contrast Mode both arcs would otherwise
              resolve to the same system colour and a full arc would look empty. */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={TRACK_RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-border"
            data-focus-dial-track=""
          />
          {/* Progress. The only thing that changes per tick. */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={TRACK_RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
            className={cn(
              'stroke-accent-focus transition-[stroke-dashoffset] duration-200 ease-linear',
              status === 'paused' && 'opacity-40'
            )}
            data-focus-dial-progress=""
            data-status={status}
          />
          {/* Mode identity dot — tiny filled circle at centre.
              Colour = domain accent for the active mode; opacity dims when idle/paused.
              `focus-mode-dot` in globals.css gives it a smooth colour transition. */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={6}
            fill={dotColor}
            opacity={dotOpacity}
            className="focus-mode-dot"
          />
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="sr-only" role="status" aria-live="polite">
            {announcement}
          </span>
          <span
            className={cn(
              'font-mono font-light leading-none tracking-tight tabular-nums text-foreground',
              isStopwatch ? 'text-[1.6rem]' : 'text-[3rem] sm:text-[3.5rem]'
            )}
          >
            {display}
          </span>
          <span className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {statusWord}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Memoised on the fields it reads.
 *
 * Without this the dial re-renders on every store change, including `intent`
 * keystrokes and `error` transitions — which is the same over-rendering problem
 * the tick refactor was meant to end, reintroduced through a different door.
 */
export const TimerDial = memo(TimerDialImpl);

export default TimerDial;
