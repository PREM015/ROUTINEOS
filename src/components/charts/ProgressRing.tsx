"use client";
/**
 * ProgressRing — a circular SVG ring visualizing a 0–100 percentage.
 *
 * `value` is clamped to 0–100. The ring fills clockwise from the top and the
 * center percentage counts up on mount, both on the shared app easing. Under
 * prefers-reduced-motion both snap to the final state. The element exposes
 * `role="progressbar"` plus ARIA value attributes.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';
import { useCountUp } from '@/components/motion/useCountUp';

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
  color = 'var(--primary)',
  trackColor = 'var(--muted)',
  label,
  showValue = true,
  className,
  ariaLabel = 'Progress',
}: ProgressRingProps) {
  const reduce = useReducedMotion();
  const clamped = Math.min(100, Math.max(0, value));
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const display = useCountUp(clamped, 1);

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
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ pathLength: reduce ? clamped / 100 : 0 }}
          animate={{ pathLength: clamped / 100 }}
          transition={{ duration: 1, ease: EASE }}
          style={{ rotate: -90, transformOrigin: '50% 50%' }}
        />
      </svg>
      {showValue && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold text-foreground">
            {reduce ? Math.round(clamped) : Math.round(display)}%
          </span>
          {label !== undefined && <span className="text-xs text-muted-foreground">{label}</span>}
        </div>
      )}
    </div>
  );
}

export default ProgressRing;