'use client';

import { Timer } from 'lucide-react';
import { FlipClock } from '@/components/focus/FlipClock';
import { FocusTimer } from '@/components/focus/FocusTimer';
import { useSleepSession } from '@/hooks/useSleepSession';
import { Stagger } from '@/components/today/ui';

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
    <div className="relative mx-auto w-full max-w-5xl px-4 py-6 sm:py-8">
      {/*
        ERROR.md F1: "the page UI can be improved as it is very boring and not
        mobile responsive."

        The two components are unchanged — the fixes that mattered were the
        contrast ones inside `FocusTimer` (see `accentFill` there). What the page
        shell lacked was any structure: a static header above two full-width
        stacked blocks, so on a wide screen the clock and the timer each sat in
        their own centred ribbon with dead space either side. They are now side by
        side from `lg`, where the dial has room for a second column beside it and
        the user's eyes do not have to travel the full width between them.
      */}
      <div
        className="gradient-mesh-animated pointer-events-none absolute inset-0 -z-10 opacity-60"
        aria-hidden="true"
      />

      <div className="relative">
        <Stagger>
          <header className="mb-6 sm:mb-8">
            <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              <Timer className="h-7 w-7 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              Focus
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Run a focus session, take planned breaks, and watch your focus minutes add up.
            </p>
          </header>
        </Stagger>

        <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 lg:grid-cols-2">
          <Stagger delay={0.06} className="min-w-0">
            <FlipClock />
          </Stagger>
          <Stagger delay={0.12} className="min-w-0">
            <FocusTimer sleepActive={sleepActive} />
          </Stagger>
        </div>
      </div>
    </div>
  );
}
