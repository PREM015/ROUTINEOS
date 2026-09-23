'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { EASE } from '@/lib/motion';

/**
 * useCountUp — eases from the current displayed value to `value` on the shared
 * app easing, starting at 0 on first mount so scores/streaks/percentages count
 * up rather than snapping to the final number. Snaps to the target immediately
 * under prefers-reduced-motion.
 */
export function useCountUp(value: number, duration = 1): number {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduce) {
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    if (from === value) return;
    const controls = animate(from, value, {
      duration,
      ease: EASE,
      onUpdate: (v) => {
        fromRef.current = v;
        setDisplay(v);
      },
    });
    return () => controls.stop();
  }, [value, duration, reduce]);

  if (reduce) return value;
  return display;
}