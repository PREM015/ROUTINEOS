'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

/**
 * First-load placeholder for `/analytics`.
 *
 * ## Why this exists rather than a spinner
 *
 * The page used to render a bare centred spinner, which is a promise that something is
 * coming and a refusal to say how much. The real page is a tall bento of differently
 * shaped blocks, so a spinner of any size is wrong: it cannot tell you whether the wait
 * is for the hero or for twelve detail cards, and when it resolves the layout jumps from
 * one line to several hundred.
 *
 * These blocks mirror the actual layout — hero band with its ring and four sub-tiles,
 * three side stats, four summary tiles, two charts, then the collapsed detail
 * disclosure — so the transition to real content moves nothing.
 *
 * ## Why it is delayed
 *
 * A skeleton that appears for 80 ms and is replaced is worse than no skeleton: it is a
 * flash, and it draws attention to the fact that loading happened. The gate holds the
 * placeholder back long enough that a fast response never renders one. Below that
 * threshold the page simply appears, which is the correct experience.
 *
 * Reduced motion does not apply here — nothing is moving. These are static
 * `animate-pulse` shapes, which is the one animation a loading state genuinely needs in
 * order to read as "waiting" rather than "broken".
 */

const DELAY_MS = 120;

export function AnalyticsSkeleton({ className }: { className?: string }) {
  return (
    <DelayedGate delayMs={DELAY_MS}>
      <div
        className={cn('container mx-auto max-w-7xl px-4 py-8', className)}
        aria-busy="true"
      >
        <span className="sr-only" role="status">
          Loading your analytics
        </span>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-full sm:w-96" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="glass-panel rounded-2xl p-6 lg:col-span-2">
            <Skeleton className="h-6 w-32 rounded-full" />
            <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
              <Skeleton className="h-32 w-32 shrink-0 rounded-full" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-56" />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className="h-[76px] rounded-xl" />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-[70px] rounded-xl" />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 lg:grid-cols-1">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-[136px] rounded-2xl" />
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="glass-panel rounded-2xl p-6">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="mt-2 h-4 w-64" />
              <Skeleton className="mt-4 h-72 rounded-xl" />
            </div>
          ))}
        </div>

        <Skeleton className="mt-6 h-[68px] rounded-2xl" />
      </div>
    </DelayedGate>
  );
}

/**
 * Holds its children back until the delay has elapsed, then renders them.
 *
 * `null` during the delay rather than a reduced placeholder, so a fast response
 * produces no flash at all. The timer is the entire mechanism — there is no layout to
 * reserve, because nothing has been rendered yet.
 */
function DelayedGate({ delayMs, children }: { delayMs: number; children: ReactNode }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  if (!shown) return null;
  return <>{children}</>;
}
