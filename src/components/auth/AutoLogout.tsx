'use client';

import { useEffect } from 'react';
import { signOut, useSession } from 'next-auth/react';

const MAX_TIMEOUT_MS = 2_147_483_647;

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

    // Absolute expiry only: sign out at the server-declared absolute timestamp.
    // No idle-based re-arm — the 6-hour clock never resets.
    //
    // `absoluteExpiresAt` is only stamped when the token carries `loginAt`, so
    // it can legitimately be absent (e.g. a session cookie issued before that
    // field existed). Falling back to `0` here treated "unknown" as "expired at
    // the epoch" and signed the user out immediately; the correct fallback is
    // the rolling `expires` that NextAuth always provides. The server still
    // enforces the hard 6-hour cap either way.
    const expiresAt =
      session.absoluteExpiresAt ?? new Date(session.expires).getTime();
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

    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [session, status]);

  return null;
}

export default AutoLogout;