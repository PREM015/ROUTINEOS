'use client';

/**
 * FloatingFocusBar — the persistent mini timer.
 *
 * ## Why this was broken before
 *
 * The old bar read `remainingMs` from the store, a field the mounted `/focus`
 * timer pushed on every tick. Two things followed from that:
 *
 *   1. Navigating away unmounted the timer, which cleared its interval but left
 *      `{ status: 'running', endsAt }` in the store. The bar kept counting down
 *      from its own copy of `endsAt` until it hit zero and stopped there — a
 *      frozen `00:00` on every page of the app.
 *   2. Its Pause/Resume/Stop buttons called `store.pause()`, which delegated to
 *      closures held inside that unmounted component. Every one was a silent
 *      no-op: the buttons looked live and did nothing at all.
 *
 * ## How it works now
 *
 * There is no value to go stale. The bar derives its display from `endsAt` and the
 * shared `useFocusNow` clock, so the number is computed at render time and cannot
 * be out of date. Its buttons call the runtime's imperative API through
 * `getFocusRuntime()`, which lives outside the React tree and therefore cannot be
 * unmounted.
 *
 * Subscriptions are per-field and minimal — seven, not thirteen, and none of them
 * re-render on a value this component does not display.
 */

import { useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Pause, Play, Square, X } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useFocusNow } from '@/hooks/useFocusNow';
import { getFocusRuntime, useFocusStore } from '@/store/focus.store';
import { formatClock, remainingMs } from '@/lib/focus/timer-machine';

/**
 * Sits above `SleepPromptHost` (bottom-36 mobile / md:bottom-24), which occupies
 * the same corner. They previously both resolved to `md:bottom-6` and overlapped
 * on desktop.
 */
const POSITION = 'fixed bottom-20 right-3 z-40 md:bottom-6 md:right-6';

export function FloatingFocusBar() {
  const pathname = usePathname();
  const router = useRouter();

  const status = useFocusStore((s) => s.status);
  const mode = useFocusStore((s) => s.mode);
  const endsAt = useFocusStore((s) => s.endsAt);
  const startedAt = useFocusStore((s) => s.startedAt);
  const pausedAt = useFocusStore((s) => s.pausedAt);
  const pausedTotalMs = useFocusStore((s) => s.pausedTotalMs);
  const plannedMs = useFocusStore((s) => s.plannedMs);
  const intent = useFocusStore((s) => s.intent);
  const collapsed = useFocusStore((s) => s.collapsed);
  const toggleCollapsed = useFocusStore((s) => s.toggleCollapsed);

  const visible = status === 'running' || status === 'paused';

  // Only subscribe to the clock when there is something to count, so a collapsed
  // or idle bar costs no renders.
  const now = useFocusNow(visible);

  /**
   * Delegate to the runtime, tolerating its absence.
   *
   * `null` is a real state, not an error: before `FocusRuntime` mounts on first
   * paint, and on any route outside the dashboard group. Navigating to `/focus`
   * is the correct fallback rather than a dead button.
   */
  const run = useCallback(
    (action: 'pause' | 'resume' | 'stop') => {
      const runtime = getFocusRuntime();
      if (!runtime) {
        // The runtime has not mounted yet — first paint, or a route outside the
        // dashboard group. Going to `/focus` is the honest fallback, and it is a
        // client-side transition so the session cookie and the SPA stay intact.
        router.push('/focus');
        return;
      }
      if (action === 'pause') void runtime.pause();
      else if (action === 'resume') void runtime.resume();
      else void runtime.stop('STOPPED');
    },
    [router]
  );

  // The page that owns the timer renders its own dial. A bar on top of it would
  // be a second, redundant copy of the same number.
  if (!visible || pathname === '/focus') return null;

  const state = {
    startedAt,
    endsAt,
    pausedAt,
    pausedTotalMs,
    plannedMs,
  } as Parameters<typeof remainingMs>[0];

  const remaining = mode === 'stopwatch' ? plannedMs : remainingMs(state, now);
  const label = mode === 'stopwatch' ? 'Stopwatch' : mode === 'short-break' ? 'Short break' : mode === 'long-break' ? 'Long break' : 'Focus';
  const display = formatClock(remaining, plannedMs >= 60 * 60_000);
  const spoken = `${label} timer, ${display}${status === 'paused' ? ', paused' : ''}`;

  if (collapsed) {
    return (
      <div role="status" aria-live="polite" aria-label={spoken} className={POSITION}>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="glass-panel flex items-center gap-2 rounded-full border border-border px-4 py-2.5 shadow-soft transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Expand ${label} timer — ${display}`}
        >
          <span
            className={cn(
              'h-2.5 w-2.5 rounded-full bg-accent-focus',
              status === 'running' && 'animate-pulse'
            )}
            aria-hidden="true"
          />
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {display}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" aria-label={spoken} className={POSITION}>
      <div className="glass-panel w-72 rounded-2xl border border-border p-4 shadow-soft">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {status === 'paused' ? 'Paused' : label}
            </p>
            {intent.trim() && (
              <p className="truncate text-xs text-muted-foreground">{intent}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/focus"
              className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Open the focus timer"
            >
              Open
            </Link>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Collapse timer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="font-mono text-3xl font-bold tabular-nums text-foreground">{display}</p>
          <div className="flex items-center gap-1.5">
            {status === 'running' ? (
              <button
                type="button"
                onClick={() => run('pause')}
                className="tap-target inline-flex min-h-9 items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Pause timer"
              >
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={() => run('resume')}
                className="tap-target inline-flex min-h-9 items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Resume timer"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                Resume
              </button>
            )}
            <button
              type="button"
              onClick={() => run('stop')}
              className="tap-target inline-flex min-h-9 items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
              aria-label="Stop timer and save what was completed"
            >
              <Square className="h-3 w-3" aria-hidden="true" />
              Stop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FloatingFocusBar;
