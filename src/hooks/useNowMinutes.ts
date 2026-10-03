'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getTodayString } from '@/lib/dates';
import { DEFAULT_TZ } from '@/lib/dates';

/**
 * Minutes since midnight **in the user's own timezone**, ticking on the minute.
 *
 * ## Why not `new Date().getHours()`
 *
 * The browser's clock is in the *viewer's* zone. Reading it directly made the
 * now line, the "current block" highlight and the "ends in 25 min" count follow
 * the machine rather than the account, so a user who set `Asia/Kolkata` and
 * opened the app from a laptop set to UTC saw their 09:00 block as already
 * finished. Everything on this page that asks "what time is it" goes through
 * here.
 *
 * ## Why the tick is aligned
 *
 * `setInterval(fn, 60000)` fires 60s after mount, so the display went stale by up
 * to a minute and — worse — every block's "remaining" count drifted out of step
 * with each other on reload. The next tick is therefore scheduled for the *next
 * minute boundary*, so the value always changes on the minute it should.
 *
 * ## Why it pauses when hidden
 *
 * A background tab does not need a re-render every minute, and the whole reason
 * this hook exists is a single moving line. On becoming visible again the value
 * is recomputed immediately, so a tab left open overnight is correct the moment
 * it is looked at rather than showing yesterday's time until the next tick.
 *
 * ## Midnight rollover
 *
 * `today` is exposed alongside the minutes because the two change together. A
 * caller watching the date is what triggers a refetch at 00:00; without it, a
 * page left open across midnight would keep rendering yesterday's blocks as if
 * they were current.
 */
export interface NowMinutes {
  /** Minutes from midnight in `timezone`. `null` until the first client read. */
  minutes: number | null;
  /** The user's current calendar date in `timezone`, or `null` before mount. */
  today: string | null;
  /** `HH:mm` in the user's zone, honouring their 12h/24h preference. */
  clock: string | null;
  /** False while the document is hidden. */
  isVisible: boolean;
  /** The clock reading used for `minutes`, for display next to the now line. */
  timezone: string;
}

function readMinutes(timezone: string): { minutes: number; today: string } {
  const now = new Date();
  // `Intl.DateTimeFormat` with an explicit zone, not `Date#getHours`.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');

  // `hour12: false` can render midnight as 24 in some ICU builds; fold it so
  // `minutes` stays in 0..1439 and the now line never sits at the far right.
  const normalizedHour = hour === 24 ? 0 : hour;

  return {
    minutes: normalizedHour * 60 + minute,
    today: getTodayString(timezone),
  };
}

/** Milliseconds until the next minute boundary, never less than 250ms. */
function msToNextMinute(): number {
  const remainder = 60_000 - (Date.now() % 60_000);
  return Math.max(250, remainder);
}

export function useNowMinutes(timezone: string): NowMinutes {
  const zone = timezone || DEFAULT_TZ;
  const [state, setState] = useState<{ minutes: number; today: string } | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // A server render has no trustworthy clock, so `minutes` starts null and the
    // page renders without a now line rather than with a guess that the first
    // client render contradicts.
    const sync = () => setState(readMinutes(zone));

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // Only tick while visible; a hidden tab resumes with an immediate read
        // when `visibilitychange` fires.
        if (document.visibilityState !== 'hidden') {
          sync();
          schedule();
        }
      }, msToNextMinute());
    };

    const onVisibility = () => {
      const visible = document.visibilityState !== 'hidden';
      setIsVisible(visible);
      if (visible) {
        sync();
        schedule();
      } else if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    sync();
    schedule();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [zone]);

  return useMemo(() => {
    const minutes = state?.minutes ?? null;
    return {
      minutes,
      today: state?.today ?? null,
      clock:
        minutes === null
          ? null
          : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
      isVisible,
      timezone: zone,
    };
  }, [state, isVisible, zone]);
}

export default useNowMinutes;