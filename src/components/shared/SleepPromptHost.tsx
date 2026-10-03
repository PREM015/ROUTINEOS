'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Timer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useSleepSession } from '@/hooks/useSleepSession';

/**
 * SleepPromptHost
 * Floating prompt card shown while a sleep prompt is pending. Mounted once in
 * the dashboard layout so the prompt is reachable from any page. Skipped on
 * /today, where the inline TodaySleep panel renders the same prompt.
 */

export function SleepPromptHost() {
  const pathname = usePathname();
  const { state, busy, error, respond, loading } = useSleepSession();

  const prompt = state?.prompt ?? null;

  /*
    A dismissed/completed prompt should not reappear mid-session.

    Derived rather than an effect: `removed` only ever needs resetting when the
    prompt goes away, and `promptKey` is the prompt's identity. Keeping the flag
    keyed to WHAT it applies to — rather than a boolean that a new prompt has to
    reset — means a new prompt can never inherit a previous dismissal.
  */
  const promptKey = prompt?.id ?? null;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const removed = dismissedKey !== null && dismissedKey === promptKey;

  /*
    The countdown, ticking.

    `Date.now()` in the render body is an impure read — two renders of identical
    state can disagree, so the value is not snapshot-able. It also only updated
    when something else happened to re-render, so a prompt left open would sit on
    a stale number.

    A one-second interval reads the clock in an effect and publishes it as state,
    which makes the countdown both pure to render and self-updating. Gated on a
    live prompt so the timer does not run on every page of the app.
  */
  const promptScheduledFor = prompt?.scheduledFor ?? null;
  const autoStartAfter = prompt?.autoStartAfterMinutes ?? null;

  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    if (promptScheduledFor === null || autoStartAfter === null) return;
    /*
      Seeded on the interval rather than synchronously: calling `setNowMs` in the
      effect body is a cascading render for a value that is under a second away
      anyway.
    */
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [promptScheduledFor, autoStartAfter]);

  const deadlineMs =
    promptScheduledFor !== null && autoStartAfter !== null
      ? Date.parse(promptScheduledFor) + autoStartAfter * 60_000
      : null;
  const secondsLeft =
    deadlineMs !== null && nowMs !== null
      ? Math.max(0, Math.round((deadlineMs - nowMs) / 1000))
      : null;
  const countdown =
    secondsLeft === null
      ? ''
      : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;

  if (loading || removed) return null;
  if (pathname === '/today') return null;
  if (!prompt) return null;

  return (
      // Stacked clear of `FloatingFocusBar`, which occupies the same corner:
      // that bar sits at `bottom-20` on mobile and `md:bottom-6` on desktop, and
      // both were pinned to `md:bottom-6` — so on desktop the sleep card and the
      // focus pill were rendered on top of each other and the pill was
      // unreachable. `bottom-36` / `md:bottom-24` clears the bar plus its
      // height, and `z-50` puts the time-sensitive prompt above it.
      <div className="fixed bottom-36 right-3 z-50 w-80 max-w-[calc(100vw-1.5rem)] md:bottom-24 md:right-6">
        <div className="rounded-xl border border-amber-500/40 bg-background/95 p-4 shadow-lg backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Time to wind down</p>
            <Timer className="h-4 w-4 text-amber-500/70" />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Target bedtime {prompt.targetBedtime || '\u2014'}. Auto-starts in{' '}
          <span className="font-semibold text-foreground tabular-nums">{countdown}</span> unless
          you say &ldquo;Not yet&rdquo;.
        </p>
        {error && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => void respond('YES')}
            isLoading={busy === 'respond'}
          >
            Start now
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => {
              void respond('NOT_YET');
              // Dismiss THIS prompt. Keyed, so a new prompt is not born dismissed.
    setDismissedKey(promptKey);
            }}
            isLoading={busy === 'respond'}
          >
            Not yet
          </Button>
        </div>
      </div>
    </div>
  );
}