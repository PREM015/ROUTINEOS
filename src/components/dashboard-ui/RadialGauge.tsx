'use client';

/**
 * `RadialGauge` — the ring, implemented once and correctly.
 *
 * The spec calls for a ring in four separate places (Day Pulse score, Right Now
 * countdown, Habits done/total, Goals on-track). The previous attempt at this
 * got the geometry wrong: a conic-gradient version set `--p` to `"42%"` and then
 * multiplied it by `3.6deg`, which is not a valid unit for anything.
 *
 * A progress ring is a circle whose `stroke-dasharray` equals its circumference
 * and whose `stroke-dashoffset` equals `circumference * (1 - fraction)`. Every
 * number here derives from `r`, so changing `size` cannot break the math.
 */

import type { ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useAnimationsEnabled } from '@/hooks/useThemeTransition';
import { accentTint } from './accent';
import { cn } from '@/lib/utils';

export function RadialGauge({
  value,
  max = 100,
  size = 132,
  stroke = 10,
  hue,
  trackClassName = 'text-muted',
  className,
  children,
  label,
  /** Dashed track - used for the "nothing scheduled" state. */
  dashed = false,
  glow = false,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  hue?: string;
  trackClassName?: string;
  className?: string;
  /** Rendered in the middle of the ring. */
  children?: ReactNode;
  label?: string;
  dashed?: boolean;
  glow?: boolean;
}) {
  const reduced = useReducedMotion();
  const animations = useAnimationsEnabled();
  const still = reduced || !animations;

  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const offset = circumference * (1 - fraction);

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      {/*
        The glow is a blurred sibling div rather than an SVG filter. A
        `feGaussianBlur` is one of the more expensive things you can put on a
        page whose rings animate, and a blurred sibling composites on the GPU.
      */}
      {glow && fraction > 0.85 && !still && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[-6px] rounded-full opacity-60 blur-lg"
          style={{ background: accentTint(hue ?? 'var(--accent-score)', 35) }}
        />
      )}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block"
        role="img"
        aria-label={label ?? `${Math.round(fraction * 100)} percent`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="currentColor"
          className={cn(trackClassName, dashed && 'opacity-60')}
          strokeDasharray={dashed ? '4 6' : undefined}
          strokeLinecap={dashed ? undefined : 'round'}
        />
        {!dashed && fraction > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={hue ?? 'var(--accent-score)'}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            /*
              A5's SVG ring draw-on. The inline `strokeDashoffset` above is the
              RESTING value - the ring at its correct completion - and the CSS
              animation only supplies the transient on first paint.

              A CSS `transition` cannot do this job: transitions do not run on an
              element's initial mount, so before this the ring appeared instantly
              at its final value. `both` fill mode means the animation ends on the
              inline value, and cancelling it under reduced motion leaves a
              correctly drawn ring rather than an empty one.
            */
            className="ring-draw"
          />
        )}
      </svg>
      {children != null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      )}
    </div>
  );
}
