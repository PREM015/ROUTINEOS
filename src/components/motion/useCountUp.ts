'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { EASE } from '@/lib/motion';

export interface CountUpOptions {
  /**
   * A5: "Kinetic count-up on any hero number — ease-out, 700-900ms, overshoots by
   * ~2% then settles. A tiny spring, not a linear ramp."
   *
   * Off by default so the ~20 existing call sites keep their current monotone
   * ramp; only hero metrics opt in, which is what the brief asks for.
   */
  spring?: boolean;
  /** Overshoot magnitude as a fraction of the target. */
  overshoot?: number;
}

/**
 * useCountUp — eases from the current displayed value to `value` on the shared
 * app easing, starting at 0 on first mount so scores/streaks/percentages count
 * up rather than snapping to the final number. Snaps to the target immediately
 * under prefers-reduced-motion.
 *
 * With `{ spring: true }` it runs a damped spring instead, which settles a
 * couple of percent past the target and eases back — the difference between a
 * number that arrived and a number that landed.
 */
export function useCountUp(
  value: number,
  duration = 1,
  options: CountUpOptions = {}
): number {
  const reduce = useReducedMotion();
  const { spring = false, overshoot = 0.02 } = options;
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduce) {
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    if (from === value) return;

    const controls = spring
      ? animate(from, value, {
          type: 'spring',
          stiffness: 170,
          damping: 14,
          // `value` is the resting point; velocity is scaled by distance so a
          // large jump overshoots by the same proportion as a small one.
          velocity: (value - from) * overshoot,
          restDelta: 0.01,
          onUpdate: (v) => {
            fromRef.current = v;
            setDisplay(v);
          },
        })
      : animate(from, value, {
          duration,
          ease: EASE,
          onUpdate: (v) => {
            fromRef.current = v;
            setDisplay(v);
          },
        });

    return () => controls.stop();
  }, [value, duration, reduce, spring, overshoot]);

  if (reduce) return value;
  return display;
}
