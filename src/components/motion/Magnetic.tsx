'use client';

import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { useRef, type PointerEvent, type ReactNode } from 'react';

/**
 * Magnetic — makes a child gently follow the cursor while hovered and spring
 * back on leave. Used sparingly (primary CTAs) as a delight layer, never for
 * dense interactive surfaces. Renders a plain wrapper under reduced motion.
 */
export function Magnetic({
  children,
  strength = 0.25,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    x.set((event.clientX - rect.left - rect.width / 2) * strength);
    y.set((event.clientY - rect.top - rect.height / 2) * strength);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x: sx, y: sy }}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
    >
      {children}
    </motion.div>
  );
}