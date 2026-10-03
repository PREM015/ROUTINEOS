'use client';

/**
 * 2.12 — one switch that makes every animation on `/today` obey the user's
 * `animationsEnabled` setting.
 *
 * The setting used to reach CSS only. `applyAppearance()` in the settings store
 * toggles `.reduce-motion` on `<html>`, and `globals.css` neutralises
 * `animation-*` and `transition-*` under that class — so the gradient mesh, the
 * `animate-pulse` skeletons and the hover transitions all stopped.
 *
 * What it did NOT reach was framer-motion, which drives the entrance stagger,
 * the score-ring sweep, the habit spring pop, the strike-through wipe and the
 * streak milestone arc. Those are JS-driven and immune to a CSS class. Worse,
 * every one of those components called `useReducedMotion()`, which reads the
 * **OS** media query — so a user who turned animations off *in the app* still
 * got the full motion, while a user whose OS said "reduce" got the reduced
 * behaviour whether or not they had asked for it.
 *
 * `MotionConfig reducedMotion` is the single point framer-motion consults for
 * every `motion.*` component in the subtree, so setting it here is what makes
 * the setting mean one thing across the whole page:
 *
 *   animationsEnabled === false -> 'always'  transforms/layouts are skipped
 *   animationsEnabled === true  -> 'user'    the OS preference decides
 *
 * The residual behaviour when animations are off is an opacity cross-fade with
 * no movement, which is the intended "calmer" mode rather than a frozen page.
 */

import { MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';
import { useAnimationsEnabled } from '@/hooks/useThemeTransition';

export function TodayMotionProvider({ children }: { children: ReactNode }) {
  const enabled = useAnimationsEnabled();
  return <MotionConfig reducedMotion={enabled ? 'user' : 'always'}>{children}</MotionConfig>;
}
