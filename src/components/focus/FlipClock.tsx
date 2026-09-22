'use client';

/**
 * FlipClock — live wall clock with per-digit CSS 3D flip.
 *
 * - Renders only after mount (localStorage + `Date.now()` would otherwise
 *   hydrate-mismatch against the server render).
 * - Ticks aligned to the second boundary via a one-shot timeout that installs
 *   the 1s interval.
 * - `prefers-reduced-motion` (media query + hook) disables the flip; digits
 *   render statically instead.
 * - Theme-aware: semantic `dark:` tokens only, no hard-coded dark colors.
 */

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'routineos:flip-clock-24h';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent): void => {
      setReduced(event.matches);
    };
    if (query.addEventListener) {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    } else {
      query.addListener(onChange);
      return () => query.removeListener(onChange);
    }
  }, []);

  return reduced;
}

function FlipDigit({ char, reduceMotion }: { char: string; reduceMotion: boolean }) {
  return (
    <span className="flip-digit" aria-hidden="true">
      <span
        key={`${char}-${reduceMotion ? 'static' : 'flip'}`}
        className={reduceMotion ? 'inline-block' : 'flip-digit-inner'}
      >
        {char}
      </span>
    </span>
  );
}

function DigitGroup({
  value,
  reduceMotion,
}: {
  value: string;
  reduceMotion: boolean;
}) {
  return (
    <span className="inline-flex">
      {value.split('').map((char, index) => (
        // Position within the two-char group is stable, so index keys are safe.
        <FlipDigit key={index} char={char} reduceMotion={reduceMotion} />
      ))}
    </span>
  );
}

export function FlipClock({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [is24h, setIs24h] = useState(true);
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        setIs24h(raw === '24');
      }
    } catch {
      // Ignore storage failures.
    }

    setNow(new Date());
    setMounted(true);

    // Align ticks to the wall-clock second so flips land exactly on time.
    let intervalId = 0;
    const delay = 1000 - (Date.now() % 1000) + 10;
    const timeoutId = window.setTimeout(() => {
      setNow(new Date());
      intervalId = window.setInterval(() => {
        setNow(new Date());
      }, 1000);
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== 0) window.clearInterval(intervalId);
    };
  }, []);

  if (!mounted || now === null) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900',
          className
        )}
        aria-hidden="true"
      >
        <div className="mx-auto h-12 w-48 animate-pulse rounded-md bg-zinc-200 sm:h-16 sm:w-72 dark:bg-zinc-800" />
        <div className="mx-auto mt-3 h-4 w-40 animate-pulse rounded bg-zinc-200 sm:w-56 dark:bg-zinc-800" />
      </div>
    );
  }

  const hours24 = now.getHours();
  const hours = is24h ? hours24 : hours24 % 12 === 0 ? 12 : hours24 % 12;
  const hh = String(hours).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const suffix = !is24h ? (hours24 < 12 ? 'AM' : 'PM') : null;
  // e.g. "Sunday, 20 September 2026"
  const dayDate = format(now, 'EEEE, d MMMM yyyy');
  const accessibleLabel = `Current time ${hh}:${mm}:${ss}${suffix ? ` ${suffix}` : ''}, ${dayDate}`;

  const toggleFormat = (): void => {
    setIs24h((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '24' : '12');
      } catch {
        // Ignore storage failures.
      }
      return next;
    });
  };

  return (
    <section
      aria-label={accessibleLabel}
      className={cn(
        'rounded-2xl border border-zinc-200 bg-white p-4 text-center sm:p-6 dark:border-zinc-800 dark:bg-zinc-900',
        className
      )}
    >
      <div
        role="timer"
        aria-hidden="true"
        className="inline-flex items-baseline justify-center gap-1 font-mono text-5xl font-bold tracking-tight text-zinc-900 tabular-nums sm:gap-2 sm:text-7xl dark:text-zinc-50"
      >
        <DigitGroup value={hh} reduceMotion={reduceMotion} />
        <span className="animate-pulse">:</span>
        <DigitGroup value={mm} reduceMotion={reduceMotion} />
        <span className="animate-pulse">:</span>
        <span className="text-sky-600 dark:text-sky-400">
          <DigitGroup value={ss} reduceMotion={reduceMotion} />
        </span>
        {suffix && (
          <span className="ml-2 text-xl font-semibold text-zinc-500 sm:text-2xl dark:text-zinc-400">
            {suffix}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm font-medium text-zinc-600 sm:text-base dark:text-zinc-300">
        {dayDate}
      </p>
      <button
        type="button"
        onClick={toggleFormat}
        aria-pressed={!is24h}
        aria-label={is24h ? 'Switch to 12-hour clock' : 'Switch to 24-hour clock'}
        className="mt-3 inline-flex items-center rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {is24h ? '24H' : '12H'} · tap to switch
      </button>
    </section>
  );
}

export default FlipClock;
