'use client';

import { useEffect } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { APP_CONFIG } from '@/config/app';

// Browsers clamp setTimeout delays to 2^31-1 ms (~24.8 days); anything larger
// overflows and fires almost immediately. Long waits must be chained.
const MAX_TIMEOUT_MS = 2_147_483_647;

const IDLE_MINUTES =
  Number.isFinite(APP_CONFIG.session.autoLogoutIdleMinutes) &&
  APP_CONFIG.session.autoLogoutIdleMinutes > 0
    ? APP_CONFIG.session.autoLogoutIdleMinutes
    : 30;
const IDLE_MS = IDLE_MINUTES * 60_000;

/**
 * AutoLogout — signs the user out automatically. Two rules apply and either
 * of them ends the session:
 *
 *  1. Idle timeout: no pointer/keyboard/touch/wheel activity for
 *     `APP_CONFIG.session.autoLogoutIdleMinutes` minutes.
 *  2. Absolute cap: the session's server-side expiry (`session.expires`,
 *     driven by `APP_CONFIG.session.maxAge`).
 *
 * In both cases the user is sent back to `/login`.
 */
export function AutoLogout() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) return;

    const timers = new Set<number>();
    const schedule = (delayMs: number, fn: () => void) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, delayMs);
      timers.add(id);
      return id;
    };

    const forceSignOut = () => {
      void signOut({ callbackUrl: '/login', redirect: true });
    };

    // Absolute cap: sign out at the server-declared expiry. Waits longer than
    // the browser limit are chained until the expiry is actually reached.
    const expiresAt = new Date(session.expires).getTime();
    const armAbsolute = () => {
      const remaining = expiresAt - Date.now();
      if (!Number.isFinite(remaining)) return;
      if (remaining <= 0) {
        forceSignOut();
        return;
      }
      schedule(Math.min(remaining, MAX_TIMEOUT_MS), armAbsolute);
    };
    armAbsolute();

    // Idle timeout: any activity re-arms the timer.
    let idleTimer: number | undefined;
    const armIdle = () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      idleTimer = schedule(Math.min(IDLE_MS, MAX_TIMEOUT_MS), forceSignOut);
    };
    armIdle();

    const activityEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, armIdle, { passive: true });
    }

    return () => {
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, armIdle);
      }
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      for (const id of timers) window.clearTimeout(id);
    };
  }, [session, status]);

  return null;
}

export default AutoLogout;
