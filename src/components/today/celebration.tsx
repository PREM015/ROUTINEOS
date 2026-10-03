'use client';

import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { useSettings } from '@/hooks/useSettings';
import { useMemo } from 'react';

/**
 * Celebration + toast helpers.
 *
 * 2.5  Confetti, for two moments the user asked for:
 *        * every NON_NEGOTIABLE habit completed
 *        * a streak milestone reached
 * 2.8  A slide-in toast with Undo after a habit or goal action.
 *
 * ## Everything is gated on the user's own setting
 *
 * `animationsEnabled` is projected onto `<html>` as `.reduce-motion` by the
 * settings store. This reads it directly as well, because a confetti burst
 * should not fire at all when the user has turned animations off — an empty
 * div is a better outcome than a burst nobody asked for.
 *
 * `canvas-confetti` is imported normally rather than dynamically. It is tiny and
 * there is no SSR path here: every call site is behind a click handler.
 */
export function useCelebration() {
  /**
   * `useSettings()` returns the whole `UserSettings` row under `settings`, so
   * `animationsEnabled` is read from there rather than off the hook's top level.
   * The store also projects it onto `<html>` as `.reduce-motion`, and
   * `disableForReducedMotion` covers the OS-level preference independently.
   */
  const settings = useSettings();
  const enabled = settings.settings?.animationsEnabled !== false;

  return useMemo(
    () => ({
      enabled,

      /** Small, tasteful burst for a completed habit. */
      habitDone(anchor?: { x: number; y: number }) {
        if (!enabled) return;
        void confetti({
          particleCount: 34,
          spread: 62,
          startVelocity: 26,
          origin: anchor
            ? { x: anchor.x / window.innerWidth, y: anchor.y / window.innerHeight }
            : { x: 0.5, y: 0.6 },
          colors: ['#047857', '#10b981', '#22c55e', '#84cc16', '#0ea5e9'],
          disableForReducedMotion: true,
        });
      },

      /** Bigger two-sided burst when every NON_NEGOTIABLE habit is done. */
      allNonNegotiablesDone() {
        if (!enabled) return;
        const defaults = { particleCount: 110, spread: 78, startVelocity: 38 };
        void confetti({ ...defaults, origin: { x: 0.5, y: 0.62 }, angle: 60 });
        void confetti({ ...defaults, origin: { x: 0.5, y: 0.62 }, angle: 120 });
        setTimeout(() => {
          void confetti({
            particleCount: 55,
            spread: 120,
            origin: { x: 0.5, y: 0.55 },
            colors: ['#047857', '#10b981', '#f59e0b', '#8b5cf6'],
            disableForReducedMotion: true,
          });
        }, 220);
      },

      /** Full-screen moment for a streak milestone. */
      streakMilestone(days: number) {
        if (!enabled) return;
        const label = days >= 365 ? 'a full year' : `${days} days`;
        void confetti({
          particleCount: 150,
          spread: 100,
          startVelocity: 42,
          origin: { x: 0.5, y: 0.5 },
          colors: ['#f97316', '#fb923c', '#fbbf24', '#f59e0b', '#10b981'],
          disableForReducedMotion: true,
        });
        toast.success(`${label} — new streak record`, {
          description: 'That is the longest run so far.',
        });
      },
    }),
    [enabled]
  );
}

/** 2.8 — a habit or goal action, with an Undo that reverses it. */
export function actionToast(
  label: string,
  undo: () => void | Promise<void>,
  options: { description?: string } = {}
) {
  toast.success(label, {
    description: options.description,
    duration: 5000,
    action: {
      label: 'Undo',
      onClick: () => {
        void undo();
      },
    },
  });
}

/** A failed action, with no Undo because there is nothing to reverse. */
export function errorToast(message: string) {
  toast.error(message);
}
