"use client";
/**
 * Gauge — a semicircular radial progress indicator (180° arc).
 *
 * The gauge sweeps clockwise from the left (180°) to the right (0°) over the
 * top. `value` is clamped to 0–100. Optional centered label and percentage text.
 *
 * Props:
 * - value: progress 0–100
 * - size:  SVG width/height in px (default 160)
 * - strokeWidth: arc thickness
 * - color:  progress color (default blue-500)
 * - trackColor: background arc color
 * - label:  small caption under the value (optional)
 * - showValue: toggle the percentage text
 */

import { cn } from '@/lib/utils';

export interface GaugeProps {
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

/** Convert an angle in degrees (0° = up, clockwise) to cartesian coordinates. */
function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

/** Build an SVG arc path from startAngle to endAngle (clockwise from up). */
function describeArc(centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArcFlag} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function Gauge({
  value,
  size = 160,
  strokeWidth = 14,
  color = '#3b82f6',
  trackColor = '#27272a',
  label,
  showValue = true,
  className,
  ariaLabel = 'Gauge',
}: GaugeProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const center = size / 2;
  const radius = (size - strokeWidth * 2) / 2;

  // Semicircle spans 180° (left) → 0° (right); progress reduces the sweep.
  const progressEnd = 180 - (clamped / 100) * 180;
  const trackPath = describeArc(center, center, radius, 180, 0);
  const progressPath = describeArc(center, center, radius, 180, progressEnd);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={cn('block', className)}
      role="img"
      aria-label={`${ariaLabel}: ${Math.round(clamped)}%`}
      aria-valuetext={label ?? undefined}
    >
      <path d={trackPath} fill="none" stroke={trackColor} strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d={progressPath} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {showValue && (
        <text
          x={center}
          y={size * 0.72}
          textAnchor="middle"
          fill="#fafafa"
          fontSize={size * 0.26}
          fontWeight={700}
        >
          {Math.round(clamped)}%
        </text>
      )}
      {label !== undefined && (
        <text
          x={center}
          y={size * 0.84}
          textAnchor="middle"
          fill="#a1a1aa"
          fontSize={size * 0.09}
        >
          {label}
        </text>
      )}
    </svg>
  );
}

export default Gauge;