'use client';

import { useEffect } from 'react';
import { attachOnlineFlush } from '@/lib/offline/outbox';
import { registerPeriodicSync, syncNotificationSchedule } from '@/lib/pwa/offline-schedule';
import { cacheSettingsSnapshot, refreshOfflineSchedule } from '@/lib/pwa/local-scheduler';
import { APP_EVENTS, onAppEvent, type AppEventName } from '@/lib/app-events';
import { useAuthStore } from '@/store/auth.store';

/**
 * Keeps the offline reminder mirror, the local schedule projection and the
 * outbox alive.
 *
 * Mounted once in the dashboard layout so it runs across every page — the point
 * of mirroring is to be current *before* the user loses signal, which means it
 * has to run during normal browsing rather than only on `/today`.
 *
 * Four jobs:
 *  1. Copy the server's notification plan into the worker while online, so
 *     reminders can fire with no connection.
 *  2. Cache the next week of resolved days + settings, then derive a **local**
 *     schedule from them — so reminders keep firing past the server's ~48 h
 *     horizon when the device stays offline.
 *  3. Flush queued user input whenever connectivity returns.
 *  4. Register periodic sync, the Android/offline firing path (`scheduledTime`
 *     covers Chromium desktop only).
 *  5. Re-derive the local schedule when a routine / day-type / habit / sleep
 *     edit changes what should be scheduled, so the worker's stored times track
 *     the user's edits instead of the last periodic mirror.
 *
 * All of it is best-effort. Every helper swallows its own failures, because a
 * failed mirror must never take the page down with it.
 */

/** How often to refresh the mirror. Frequent enough to stay useful, cheap enough to ignore. */
const MIRROR_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Events that change what the local schedule should contain. A day-mode change
 * swaps the whole routine for a date; a routine edit moves a block; a sleep or
 * habit edit moves a prompt. Without this the worker would keep firing the
 * times the user just deleted.
 */
const SCHEDULE_INVALIDATING_EVENTS: readonly AppEventName[] = [
  APP_EVENTS.ROUTINE_DATA_CHANGED,
  APP_EVENTS.DAY_MODE_CHANGED,
  APP_EVENTS.HABITS_DATA_CHANGED,
  APP_EVENTS.SLEEP_DATA_CHANGED,
  APP_EVENTS.SETTINGS_CHANGED,
] as const;

/**
 * Coalesce edits into one refresh. Dragging a routine block fires a change per
 * drop, and `refreshOfflineSchedule` re-fetches a week of days — running it
 * once per event would turn a single drag into eight requests.
 */
const REFETCH_DEBOUNCE_MS = 2_000;

export function OfflineSync() {
  const userId = useAuthStore((state) => state.user?.id ?? null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const mirror = () => {
      if (cancelled) return;
      // Server plan first (fast path), then cache + local projection.
      void syncNotificationSchedule();
      void cacheSettingsSnapshot(userId).then(() => refreshOfflineSchedule(userId));
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
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    // Typed as `number` rather than inferred: `@types/node` merges a `Timeout`
    // overload onto the global `setTimeout`, so `typeof window.setTimeout`
    // does not resolve to the DOM signature this component is compiled against.
    let debounce: number | null = null;
    const scheduleRefresh = () => {
      window.clearTimeout(debounce ?? undefined);
      debounce = window.setTimeout(() => {
        void cacheSettingsSnapshot(userId).then(() => refreshOfflineSchedule(userId));
      }, REFETCH_DEBOUNCE_MS) as unknown as number;
    };

    const detachers = SCHEDULE_INVALIDATING_EVENTS.map((name) => onAppEvent(name, scheduleRefresh));
    return () => {
      window.clearTimeout(debounce ?? undefined);
      detachers.forEach((detach) => detach());
    };
  }, [userId]);

  return null;
}
