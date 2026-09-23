"use client";
/**
 * Gauge — a semicircular radial progress indicator (180° arc).
 *
 * The gauge sweeps clockwise from the left (180°) to the right (0°) over the
 * top. `value` is clamped to 0–100. The arc draws itself in and the label
 * counts up on mount, both on the shared app easing. Under
 * prefers-reduced-motion both snap to the final state.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';
import { useCountUp } from '@/components/motion/useCountUp';

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
  color = 'var(--primary)',
  trackColor = 'var(--muted)',
  label,
  showValue = true,
  className,
  ariaLabel = 'Gauge',
}: GaugeProps) {
  const reduce = useReducedMotion();
  const clamped = Math.min(100, Math.max(0, value));
  const center = size / 2;
  const radius = (size - strokeWidth * 2) / 2;
  const display = useCountUp(clamped, 1);

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
      <motion.path
        d={progressPath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        initial={{ pathLength: reduce ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: EASE }}
        style={{ transition: 'stroke 0.6s var(--ease-out-expo)' }}
      />
      {showValue && (
        <text
          x={center}
          y={size * 0.72}
          textAnchor="middle"
          fill="var(--foreground)"
          fontSize={size * 0.26}
          fontWeight={700}
        >
          {reduce ? Math.round(clamped) : Math.round(display)}%
        </text>
      )}
      {label !== undefined && (
        <text
          x={center}
          y={size * 0.84}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize={size * 0.09}
        >
          {label}
        </text>
      )}
    </svg>
  );
}

export default Gauge;