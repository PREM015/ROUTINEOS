'use client';

import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useCountUp } from '@/components/motion/useCountUp';
import { useAnimationsEnabled } from '@/hooks/useAnimationsEnabled';
import { cn } from '@/lib/utils';

/**
 * A progress ring.
 *
 * The `framer-motion` circle-drawing approach was rejected: it needs a path
 * length the browser computes, animates a `strokeDashoffset` on every change,
 * and cannot be server-rendered meaningfully. A `strokeDasharray` transition on
 * a plain circle is the same visual result in three lines.
 *
 * ## Why the arc is a gradient and not a flat colour
 *
 * A single flat `var(--primary)` stroke on a `--muted` track reads as a dead
 * control when the value is low, because at 0% there is no arc at all and the
 * eye gets nothing to hold onto. The gradient gives the arc a lit end and a
 * receding end, so a partially-drawn ring still looks like a ring in progress
 * rather than a rendering failure.
 *
 * ## `relative` is load-bearing
 *
 * The centre value is `absolute inset-0`. Without `relative` on this element it
 * resolves against some distant positioned ancestor and lands somewhere else on
 * the page entirely — which is what made the ring look empty.
 *
 * Accessibility: `role="progressbar"` with `aria-valuenow/min/max` and a real
 * label. The visible number is `aria-hidden` so a screen reader announces the
 * label once rather than "75 percent, 75".
 */
export function ProgressRing({
  value,
  size = 64,
  strokeWidth = 6,
  label,
  ariaLabel,
  className,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  // B2's gate, so the arc's count-up and the page's other motion agree about
  // whether the user wants animation at all.
  const animationsEnabled = useAnimationsEnabled();
  const gradientId = useId();

  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  // `useCountUp` takes seconds, and takes a third options argument.
  const animated = useCountUp(clamped, reduceMotion || !animationsEnabled ? 0 : 0.7);
  const shown = reduceMotion || !animationsEnabled ? clamped : animated;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - shown / 100);
  const center = size / 2;

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel ?? label ?? 'Progress'}
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--accent-focus)" />
          </linearGradient>
        </defs>

        {/* The track. Slightly inset so the arc's rounded caps never touch it. */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={strokeWidth}
        />

        {/*
          The lit head. A blurred copy of the arc sitting under it, which is what
          turns a flat stroke into something that looks like it is emitting. Only
          drawn once there is an arc to light.
        */}
        {clamped > 0 && (
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            /*
             * An explicit numeric `initial`, not `initial={false}`.
             *
             * Without one, Framer reads the *starting* value out of the DOM — and
             * `strokeDashoffset` is an SVG presentation attribute, not a style, so
             * that read is `undefined`. It then warns
             * "trying to animate strokeDashoffset from 'undefined'" and skips the
             * tween. Starting at the full circumference is also the right
             * behaviour: the ring draws itself in from empty on mount.
             */
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
            transform={`rotate(-90 ${center} ${center})`}
            style={{ filter: 'blur(4px)', opacity: 0.5 }}
          />
        )}

        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          // Same reason as the glow arc above.
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>

      {/*
        The centre value. Defaults to the bare percentage so a ring is never
        empty — a ring with a track and no number is the single most
        dead-looking thing a progress indicator can be. `tabular-nums` stops the
        digits from shifting width as they count.
      */}
      <span
        aria-hidden="true"
        className="absolute inset-0 flex flex-col items-center justify-center leading-none"
      >
        <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
          {label ?? `${Math.round(shown)}`}
        </span>
        <span className="mt-0.5 font-mono text-[9px] tabular-nums text-muted-foreground">
          {label ? '%' : ''}
        </span>
      </span>
    </div>
  );
}

export default ProgressRing;