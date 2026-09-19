"use client";
/**
 * ProgressRing — a circular SVG ring visualizing a 0–100 percentage.
 *
 * `value` is clamped to 0–100. The ring sweeps clockwise from the top
 * (`transform: rotate(-90deg)`), with an optional centered label. The element
 * exposes `role="progressbar"` plus ARIA value attributes.
 *
 * Props:
 * - value: progress 0–100
 * - size:  SVG width/height in px (default 120)
 * - strokeWidth: ring thickness
 * - color:  progress color (default blue-500)
 * - trackColor: background ring color
 * - label:  caption rendered under the ring text (optional)
 * - showValue: toggle the centered percentage text
 */

import { cn } from '@/lib/utils';

export interface ProgressRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  showValue?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function ProgressRing({
  value,
  size = 120,
  strokeWidth = 10,
  color = '#3b82f6',
  trackColor = '#27272a',
  label,
  showValue = true,
  className,
  ariaLabel = 'Progress',
}: ProgressRingProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference * (1 - clamped / 100);

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="block"
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
      >
        <circle cx={center} cy={center} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={progressOffset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      {showValue && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold text-white">{Math.round(clamped)}%</span>
          {label !== undefined && <span className="text-xs text-gray-400">{label}</span>}
        </div>
      )}
    </div>
  );
}

export default ProgressRing;