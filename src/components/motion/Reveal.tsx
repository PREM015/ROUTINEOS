'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { EASE, fadeSlideUp, stagger } from '@/lib/motion';

/**
 * Reveal — scroll-triggered fade + slide-up wrapper. Fires once when the
 * element enters the viewport; falls back to a static render when the user
 * prefers reduced motion.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-80px' }}
      transition={{ duration: 0.7, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stagger — parent for lists/grids. Reveals its `StaggerItem` children one by
 * one (80ms apart) once it scrolls into view.
 */
export function Stagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={stagger}
    >
      {children}
    </motion.div>
  );
}

/** StaggerItem — a single animated child used inside `Stagger`. */
export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div className={className} variants={fadeSlideUp}>
      {children}
    </motion.div>
  );
}