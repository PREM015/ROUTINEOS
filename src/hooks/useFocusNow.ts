'use client';

import { useEffect, useState } from 'react';

/**
 * `useFocusNow` — the app's only focus-timer tick.
 *
 * ## Why this is a shared module rather than a hook per component
 *
 * The old design had at least three independent timers fighting over the same
 * display: `FocusTimer`'s 200 ms interval, `FloatingFocusBar`'s own 250 ms
 * interval, and `FlipClock`'s second-aligned one. Each computed the same number
 * from its own copy of state, so they could disagree, and each kept running while
 * its component was mounted — which is why navigating away from `/focus` left the
 * bar counting down to zero and stopping there.
 *
 * One tick, one clock, one number.
 *
 * ## Why 250 ms
 *
 * A countdown is displayed to whole seconds, so a tick faster than the displayed
 * resolution only costs renders. 250 ms gives sub-second accuracy for the stopwatch
 * (which *does* show centiseconds) and lands on the second boundary well under
 * 1% of the time, so the display is never visibly late.
 *
 * ## Why it does not tick in a hidden tab
 *
 * A backgrounded tab's timers are throttled to roughly once a minute by the
 * browser, so ticking there buys nothing and costs a render per minute forever.
 * The `visibilitychange` listener re-syncs the moment the tab comes back, which is
 * also the moment the value is actually needed. Combined with the fact that every
 * readout is derived from `Date.now()` rather than accumulated, a gap of any length
 * is harmless: the number is correct the instant it is rendered again.
 *
 * ## Reference counting
 *
 * Several components read the clock at once (the dial, the floating bar, the
 * document title). Each subscribes; the interval is only running while at least
 * one is mounted, and the last unsubscribe clears it. A naive
 * `setInterval`-per-subscriber version would run N intervals for N consumers,
 * which is the multi-timer problem this file exists to end.
 */

const TICK_MS = 250;

type Listener = (now: number) => void;

const listeners = new Set<Listener>();

let intervalId: number | null = null;
let lastEmit = 0;

/** Coalesce a burst of `Date.now()` calls in the same tick into one render. */
function emit(now: number): void {
  if (now - lastEmit < 16) return;
  lastEmit = now;
  for (const listener of listeners) listener(now);
}

function ensureRunning(): void {
  if (intervalId !== null || typeof window === 'undefined') return;
  // Emit immediately so a subscriber that just mounted gets a value this frame
  // rather than waiting up to 250 ms for a blank dial.
  emit(Date.now());
  intervalId = window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    emit(Date.now());
  }, TICK_MS);
}

function maybeStop(): void {
  if (listeners.size > 0 || intervalId === null) return;
  window.clearInterval(intervalId);
  intervalId = null;
}

// The tab becoming visible is the only moment a suspended tick matters, and it is
// the only moment a `visibilitychange` listener is needed. Registered once at
// module scope rather than per subscriber, for the same reason the interval is.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') emit(Date.now());
  });
}

/**
 * Subscribe to the shared clock.
 *
 * The returned value is a `number`, not a `Date`, so arithmetic in a render is
 * direct and the value is cheap to compare in a memo dependency.
 *
 * @param active Pass `false` to keep the component mounted but stop it re-rendering
 *   once per tick — for example a history list that only needs the clock when a
 *   session is live. Defaults to true.
 */
export function useFocusNow(active = true): number {
  const [now, setNow] = useState(() => Date.now());

  // Subscription identity follows `active`, rather than reading it through a ref
  // during render. A ref would avoid re-subscribing, but reading `ref.current`
  // while rendering is exactly the pattern the React Compiler lint rules flag:
  // the value is invisible to the render pass, so a component can be showing a
  // stale clock with no way for React to know. Toggling `active` costs one
  // subscribe/unsubscribe, which is not worth that ambiguity.
  useEffect(() => {
    if (!active) return;
    const listener: Listener = (value) => setNow(value);
    listeners.add(listener);
    ensureRunning();
    return () => {
      listeners.delete(listener);
      maybeStop();
    };
  }, [active]);

  return now;
}

/**
 * Test seam: reset module state.
 *
 * Only meaningful between tests. Without it, a test file that mounts and unmounts
 * a subscriber leaves a live interval behind and the next suite fails on a
 * "timer was still running" assertion that has nothing to do with its subject.
 */
export function __resetFocusNowForTests(): void {
  listeners.clear();
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
  lastEmit = 0;
}
