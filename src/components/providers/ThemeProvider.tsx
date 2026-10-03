'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { useThemeTransition } from '@/hooks/useThemeTransition';

/**
 * Theme provider.
 *
 * The sole owner of the `dark` class. Do not toggle it from a store or a
 * component — `next-themes` also keeps `localStorage` and the system
 * preference in sync, and fighting it produces a flash plus a stale preference.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // `disableTransitionOnChange` used to be set here. It makes next-themes
      // inject a temporary stylesheet that sets `transition: none` on everything
      // during a theme change, which is precisely what feature 2.12 is trying to
      // replace with a deliberate 300ms fade. It is removed, and
      // `useThemeTransition` below adds the transition for exactly one tick
      // instead — long enough to animate, short enough that ordinary hover
      // states are unaffected.
    >
      <ThemeTransitionBridge />
      {children}
    </NextThemesProvider>
  );
}

/**
 * Calls the hook inside the provider so it can read `resolvedTheme` from
 * context, then renders nothing.
 */
function ThemeTransitionBridge() {
  useThemeTransition();
  return null;
}
