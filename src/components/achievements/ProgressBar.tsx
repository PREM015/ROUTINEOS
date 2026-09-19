'use client';

/**
 * ProgressBar — reusable horizontal progress bar.
 *
 * Displays a value relative to a maximum with an optional label, percentage
 * readout and a custom accent color (Tailwind color name or hex). Unlike the
 * animated ui/Progress primitive, this bar is fully color-customisable and
 * deterministic (no external animation), which makes it stable inside
 * achievement cards and tight layouts.
 *
 * Usage:
 *   <ProgressBar value={3} max={7} color="#3b82f6" label="Streak" showPct />
 */

import { cn } from '@/lib/utils';

export interface ProgressBarProps {
  /** Current value (0 when omitted). */
  value?: number;
  /** Maximum value the bar is measured against. */
  max?: number;
  /** Accent color: a hex string or Tailwind color class (e.g. "#22c55e" or "bg-green-500"). */
  color?: string;
  /** Optional text rendered above the track. */
  label?: string;
  /** Render the computed percentage next to the label. */
  showPct?: boolean;
  className?: string;
  /** Classes applied to the filled portion of the track. */
  barClassName?: string;
  /** Accessible name for the progress region. */
  ariaLabel?: string;
}

const COLOR_CLASSES = new Set([
  'bg-blue-600',
  'bg-green-500',
  'bg-green-600',
  'bg-red-500',
  'bg-red-600',
  'bg-yellow-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-indigo-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-teal-500',
  'bg-gray-500',
  'bg-gray-700',
]);

export function ProgressBar({
  value = 0,
  max = 100,
  color,
  label,
  showPct = false,
  className,
  barClassName,
  ariaLabel,
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const percentage = Math.round((clamped / safeMax) * 100);

  const isHexColor = typeof color === 'string' && color.startsWith('#');
  const usesClassColor =
    typeof color === 'string' && !color.startsWith('#') && COLOR_CLASSES.has(color);

  return (
    <div className={cn('w-full', className)}>
      {(label || showPct) && (
        <div className="mb-1 flex items-center justify-between text-xs">
          {label && <span className="font-medium text-gray-600">{label}</span>}
          {showPct && <span className="tabular-nums text-gray-400">{percentage}%</span>}
        </div>
      )}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-label={ariaLabel ?? label}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={safeMax}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300',
            barClassName,
            usesClassColor ? color : 'bg-blue-600'
          )}
          style={isHexColor ? { backgroundColor: color, width: `${percentage}%` } : { width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default ProgressBar;