'use client';

import { useEffect } from 'react';
import { attachOnlineFlush } from '@/lib/offline/outbox';
import { registerPeriodicSync, syncNotificationSchedule } from '@/lib/pwa/offline-schedule';

/**
 * Keeps the offline reminder mirror and the outbox alive.
 *
 * Mounted once in the dashboard layout so it runs across every page — the point
 * of mirroring is to be current *before* the user loses signal, which means it
 * has to run during normal browsing rather than only on `/today`.
 *
 * Three jobs:
 *  1. Copy the server's notification plan into the worker while online, so
 *     reminders can fire with no connection.
 *  2. Flush queued user input whenever connectivity returns.
 *  3. Register periodic sync, which is the Android/offline firing path
 *     (`scheduledTime` covers Chromium desktop only).
 *
 * All of it is best-effort. Every helper swallows its own failures, because a
 * failed mirror must never take the page down with it.
 */

/** How often to refresh the mirror. Frequent enough to stay useful, cheap enough to ignore. */
const MIRROR_INTERVAL_MS = 15 * 60 * 1000;

export function OfflineSync() {
  useEffect(() => {
    let cancelled = false;

    const mirror = () => {
      if (cancelled) return;
      void syncNotificationSchedule();
    };

    // Immediate first pass, then periodically, plus on every reconnect — a user
    // who goes offline for an hour should not rely on the interval alone.
    mirror();
    void registerPeriodicSync();

    const interval = window.setInterval(mirror, MIRROR_INTERVAL_MS);
    const detachFlush = attachOnlineFlush(() => {
      // A reconnect is the most likely moment for the plan to have changed.
      mirror();
    });

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      detachFlush();
    };
  }, []);

  return null;
}
