'use client';

/**
 * ProgressBar — a horizontal bar whose track and fill both follow the theme.
 *
 * ## The light-only track
 *
 * This bar hardcoded `bg-gray-200` for the track and `text-gray-600` /
 * `text-gray-400` for its labels. On the dark card it is used from, that put a
 * near-white track behind a coloured fill, so an unlocked achievement drew the
 * loudest element on the tile — the empty part of the bar, which carries no
 * information. The track is `bg-muted` now, so it recedes in both themes and the
 * fill is the only thing that draws the eye.
 *
 * ## Why the Tailwind-class colour path is gone
 *
 * The old signature accepted either a hex string *or* a Tailwind class
 * (`bg-green-500`), choosing between them by testing the string against a
 * hardcoded `COLOR_CLASSES` set. That set was a closed list: any class not
 * enumerated in this file silently fell back to `bg-blue-600`, so a caller passing
 * a perfectly valid `bg-amber-500` got a blue bar and no error. Tailwind cannot
 * see a class built at runtime anyway, so the dynamic half of that path never
 * worked reliably.
 *
 * `color` is now always a real CSS colour applied via `style`, defaulting to the
 * habits accent. Every call site already passed a hex string or `undefined`, so
 * this is a narrowing, not a break.
 *
 * Usage:
 *   <ProgressBar value={3} max={7} color="#22c55e" label="Streak" showPct />
 */

import { cn } from '@/lib/utils';

export interface ProgressBarProps {
  /** Current value (0 when omitted). */
  value?: number;
  /** Maximum value the bar is measured against. */
  max?: number;
  /**
   * Any CSS colour for the fill - a hex string, a `var(--token)` reference, or a
   * `color-mix(...)` expression. Defaults to the habits accent.
   */
  color?: string;
  /** Optional text rendered above the track. */
  label?: string;
  /** Render the computed percentage next to the label. */
  showPct?: boolean;
  className?: string;
  /** Classes applied to the filled portion of the track. */
  barClassName?: string;
  /** Classes applied to the empty track behind the fill. */
  trackClassName?: string;
  /** Accessible name for the progress region. */
  ariaLabel?: string;
}

const DEFAULT_FILL = 'var(--accent-habits)';

export function ProgressBar({
  value = 0,
  max = 100,
  color,
  label,
  showPct = false,
  className,
  barClassName,
  trackClassName,
  ariaLabel,
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const percentage = Math.round((clamped / safeMax) * 100);
  const name = ariaLabel ?? label;

  return (
    <div className={cn('w-full', className)}>
      {(label || showPct) && (
        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
          {label && (
            <span className="truncate font-medium text-muted-foreground">{label}</span>
          )}
          {showPct && (
            <span className="shrink-0 tabular-nums text-muted-foreground">{percentage}%</span>
          )}
        </div>
      )}
      <div
        className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', trackClassName)}
        role="progressbar"
        aria-label={name}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        // A bar with no accessible name is a decorative rectangle to a screen
        // reader. `name` is always resolvable here because every call site passes
        // a label or an explicit ariaLabel, but the fallback keeps that honest.
        aria-valuetext={`${clamped} of ${safeMax}`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none',
            barClassName
          )}
          style={{ backgroundColor: color ?? DEFAULT_FILL, width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default ProgressBar;