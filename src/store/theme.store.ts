/**
 * Theme zustand store.
 *
 * Persists the light/dark theme choice and applies it to the document so
 * the whole app follows Tailwind's `dark:` variants. Uses zustand's `persist`
 * middleware (localStorage key `theme`). `'system'` resolves via
 * `matchMedia` against the operating system preference.
 */

'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  applyToDocument: () => void;
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return mode;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      resolved: 'light',
      setMode: (mode) => {
        const resolved = resolveTheme(mode);
        set({ mode, resolved });
        get().applyToDocument();
      },
      toggle: () => {
        const next: ThemeMode = get().resolved === 'dark' ? 'light' : 'dark';
        set({ mode: next, resolved: next });
        get().applyToDocument();
      },
      applyToDocument: () => {
        if (typeof document !== 'undefined') {
          const resolved = resolveTheme(get().mode);
          document.documentElement.classList.toggle('dark', resolved === 'dark');
          if (get().resolved !== resolved) set({ resolved });
        }
      },
    }),
    {
      name: 'theme',
      partialize: (state) => ({ mode: state.mode }),
      onRehydrateStorage: () => (state) => {
        if (typeof window !== 'undefined' && state) {
          state.applyToDocument();
        }
      },
    }
  )
);