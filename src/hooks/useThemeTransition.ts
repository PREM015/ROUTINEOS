'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useSettingsStore } from '@/store/settings.store';

/**
 * 2.12 — smooth light/dark theme transition.
 *
 * Adds `.theme-transition` to `<html>` for one tick either side of a theme
 * change, so the colour swap is animated once and then the class is removed.
 *
 * ## Why the class is transient
 *
 * Leaving it on permanently would give every element in the app a 300ms
 * transition on background, border, colour, fill, stroke and box-shadow — which
 * changes how ordinary hover states feel and makes the UI feel sluggish. The
 * class exists only for the swap.
 *
 * ## Why it respects `animationsEnabled`
 *
 * If the user turned animations off, `settings.store` projects
 * `.reduce-motion` onto `<html>`, and the stylesheet's
 * `.reduce-motion.theme-transition` rule collapses the transition to `none`. The
 * hook additionally skips adding the class at all, so the DOM does not even
 * carry it.
 *
 * ## Mount behaviour
 *
 * No transition on the very first render. Applying it on mount would make every
 * page load fade in from white, which is a flash, not a transition.
 */
export function useThemeTransition(): void {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    // `null` before next-themes has resolved on the client: that is the first
    // render, and there is nothing to transition from.
    if (!resolvedTheme) return;

    const root = document.documentElement;
    // `animationsEnabled === false` is projected as `.reduce-motion`.
    if (root.classList.contains('reduce-motion')) return;

    root.classList.add('theme-transition');

    // Two frames: the first commits the "from" state, the second lets the
    // browser paint it, so the change is actually animated rather than skipped
    // as a same-frame mutation.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        root.classList.remove('theme-transition');
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      root.classList.remove('theme-transition');
    };
  }, [resolvedTheme]);
}

/** Read the raw flag, for components that want to branch in JS. */
export function useAnimationsEnabled(): boolean {
  return useSettingsStore((s) => s.settings?.animationsEnabled !== false);
}
