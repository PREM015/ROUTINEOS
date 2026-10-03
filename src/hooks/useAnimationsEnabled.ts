'use client';

import { useReducedMotion } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';

/**
 * Whether decorative motion should run at all.
 *
 * ## Two signals, both required
 *
 *  1. the OS `prefers-reduced-motion` preference, and
 *  2. the in-app `animationsEnabled` setting, which the store also projects onto
 *     `<html>` as `.reduce-motion`.
 *
 * Both are honoured everywhere. A user who turned animations off in Settings
 * should not get a breathing capsule because their OS says nothing about
 * motion, and a user whose OS asks for reduced motion should not get one
 * because they left the app setting on. `AND`, not `OR` — motion runs only when
 * *both* say yes.
 *
 * ## Why this exists rather than being inlined
 *
 * The two-signal check was being written out by hand in at least three places
 * (`routine/page.tsx`, `today/celebration.tsx`, `dashboard-ui/Panel.tsx`), each
 * with a slightly different shape. One hook means the rule has one
 * implementation, and a card deep in the tree does not have to be handed an
 * `animationsEnabled` prop through two components to honour it.
 *
 * `useSettings()` is a zustand selector, so subscribing from several components
 * is a reference comparison rather than a re-render storm.
 */
export function useAnimationsEnabled(): boolean {
  const settings = useSettings();
  const prefersReduced = useReducedMotion();

  const userEnabled = settings.settings?.animationsEnabled !== false;

  return userEnabled && !prefersReduced;
}

export default useAnimationsEnabled;
