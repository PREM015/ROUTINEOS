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
 * The analog face mirrors the local wall clock, while the adjacent digital value
 * remains authoritative: countdown hands show time remaining, stopwatch hands show
 * time elapsed. Both are derived from the shared Focus runtime clock.
 */

import { memo } from 'react';

import { cn } from '@/lib/utils';
import { useFocusNow } from '@/hooks/useFocusNow';
import { useFocusStore, isLive } from '@/store/focus.store';
import { AnalogClockFace } from '@/components/focus/AnalogClockFace';
import { getCountdownHandAngles, getDurationHandAngles } from '@/lib/focus/world-clock';
import {
  elapsedMs,
  formatClock,
  formatStopwatch,
  progressFraction,
  remainingMs,
} from '@/lib/focus/timer-machine';

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
 * The text equivalent of timer progress.
 *
 * Progress is a visual encoding, so without this a screen-reader user knows how much
 * time is left but never how far through the block they are.
 *
 * Spoken as a rounded ten, because that is a stable string while progress advances and
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
  const announcement = !live
    ? 'Timer ready'
    : status === 'paused'
      ? announceMinute(remaining, true)
      : announceMinute(remaining, false);

  const statusWord =
    status === 'running'
      ? isStopwatch
        ? 'Running'
        : 'Focusing'
      : status === 'paused'
        ? 'Paused'
        : 'Ready';

  const progressAlt = describeProgress(fraction, isStopwatch);
  const handAngles = isStopwatch
    ? getDurationHandAngles(elapsed)
    : getCountdownHandAngles(remaining);
  const dialLabel = `${mode === 'focus' ? 'Focus' : mode.replace('-', ' ')} timer, ${display} ${isStopwatch ? 'elapsed' : 'remaining'}${progressAlt ? `, ${progressAlt}` : ''}`;

  return (
    <div
      className={cn(
        'grid w-full max-w-2xl grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 sm:gap-7',
        className,
      )}
    >
      <AnalogClockFace
        angles={handAngles}
        label={dialLabel}
        gradientId="focus-timer-clock-face"
        className="min-w-0"
      />

      <div className="min-w-0 space-y-3 sm:space-y-4">
        <div>
          <p className="text-muted-foreground text-[0.68rem] font-bold uppercase tracking-[0.18em]">
            {isStopwatch ? 'Time elapsed' : 'Time remaining'}
          </p>
          <span className="text-foreground mt-1 block whitespace-nowrap font-mono text-[clamp(1.25rem,5.2vw,2.5rem)] font-bold tabular-nums leading-none tracking-tight">
            {display}
          </span>
        </div>
        <span className="border-border/70 bg-card/75 text-muted-foreground inline-flex rounded-full border px-3 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.16em] shadow-sm backdrop-blur">
          {statusWord}
        </span>
        {!isStopwatch && (
          <div
            role="progressbar"
            aria-label="Focus session progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fraction * 100)}
            aria-valuetext={progressAlt ?? undefined}
            className="bg-background/75 h-2 overflow-hidden rounded-full"
            data-focus-timer-track=""
          >
            <div
              className={cn(
                'from-accent-focus via-accent-streak to-accent-insights h-full rounded-full bg-gradient-to-r transition-[width] duration-200 ease-linear motion-reduce:transition-none',
                status === 'paused' && 'opacity-50',
              )}
              style={{ width: `${fraction * 100}%` }}
              data-focus-timer-progress=""
              data-status={status}
            />
          </div>
        )}
        {progressAlt && <span className="sr-only">{progressAlt}</span>}
        <span className="sr-only" role="status" aria-live="polite">
          {announcement}
        </span>
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
