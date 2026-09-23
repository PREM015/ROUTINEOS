'use client';

import { Timer } from 'lucide-react';
import { FlipClock } from '@/components/focus/FlipClock';
import { FocusTimer } from '@/components/focus/FocusTimer';
import { useSleepSession } from '@/hooks/useSleepSession';

/**
 * Focus Page (spec P1-7).
 *
 * Composition only: the wall clock (FlipClock) plus the self-contained
 * FocusTimer, which owns the timer state, settings, session POSTs, and the
 * single `GET /api/focus?limit=100` history fetch. History is deliberately
 * not fetched anywhere else on this page (e.g. FocusStats is not embedded)
 * so the endpoint is requested exactly once.
 */
export default function FocusPage() {
  const { state } = useSleepSession();
  const sleepActive = Boolean(state?.active);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground sm:text-3xl">
          <Timer className="h-7 w-7 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          Focus
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Run a focus session, take planned breaks, and watch your focus minutes add up.
        </p>
      </div>

      <FlipClock />

      <div className="mt-6">
        <FocusTimer sleepActive={sleepActive} />
      </div>
    </div>
  );
}
