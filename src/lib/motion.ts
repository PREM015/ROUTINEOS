import type { Variants } from 'framer-motion';

/**
 * Single easing curve used across the whole app (also exposed to Tailwind as
 * `ease-out-expo` and used by the CSS keyframes in globals.css). Keeping every
 * animation on one curve gives the product a consistent feel of motion.
 */
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const EASE_SPRING = { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 } as const;

/** Fade + rise used for scroll-triggered reveals and page entrances. */
export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE },
  },
};

/** Fade-only variant for backgrounds/overlays where movement adds noise. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.6, ease: EASE },
  },
};

/** Parent container that staggers its `fadeSlideUp` children on reveal. */
export const stagger: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};