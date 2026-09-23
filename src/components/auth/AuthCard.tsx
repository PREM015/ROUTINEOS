"use client";

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';

/**
 * AuthCard — shared chrome for every `(auth)` group page (login, register,
 * password reset, 2FA, email verification, logout). Themed to the global
 * design system: card surface + border + floating elevation + a single
 * fade/rise entrance. Under reduced motion the entrance is skipped.
 */
export function AuthCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE }}
      className={cn(
        'glass-panel glow-primary w-full max-w-md rounded-2xl p-8 shadow-long backdrop-blur-xl',
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

/** Shared input styles for raw `(auth)` fields (matches login/register). */
export const AUTH_INPUT_CLASS =
  'w-full rounded-lg border border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/60 transition-all outline-none focus:border-primary focus:ring-1 focus:ring-primary p-3';

export default AuthCard;