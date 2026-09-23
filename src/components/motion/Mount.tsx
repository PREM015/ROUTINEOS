'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { EASE } from '@/lib/motion';

/**
 * Mount — fade + rise the moment a widget/section mounts. Used to stagger
 * dashboard and today widgets into place so the page feels like it is
 * "assembling" rather than popping in whole. Falls back to a static render
 * under prefers-reduced-motion.
 */
export function Mount({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}