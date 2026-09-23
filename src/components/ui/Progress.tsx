import { motion, useReducedMotion } from 'framer-motion';
import { EASE } from '@/lib/motion';

export function Progress({ value, max = 100, className = '' }: { value: number; max?: number; className?: string }) {
  const reduce = useReducedMotion();
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  return (
    <div
      className={`w-full bg-muted rounded-full h-2.5 overflow-hidden ${className}`}
      role="progressbar"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className="bg-primary h-2.5 rounded-full transition-colors duration-300"
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${percentage}%` }}
        transition={{ duration: 0.6, ease: EASE }}
      />
    </div>
  );
}