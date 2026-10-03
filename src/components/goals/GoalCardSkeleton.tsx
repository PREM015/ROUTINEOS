'use client';

import { cn } from '@/lib/utils';

/**
 * Placeholder that matches the real card's geometry.
 *
 * The previous page had no `loading.tsx` and no skeleton at all: while
 * `AppContext` was in flight, `goals` was `[]`, so `/goals` rendered
 * "No daily goals" — a confident, complete-looking empty state for data that had
 * not arrived. A skeleton whose box matches the finished card is what stops the
 * layout jumping when the real thing lands.
 *
 * Geometry is duplicated deliberately rather than shared: a skeleton that
 * imported the card's own padding and gap constants would break the moment the
 * card changed, which is exactly when it matters most.
 */
export function GoalCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex flex-col gap-3 rounded-xl border border-border bg-card p-4', className)}
      aria-hidden="true"
    >
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 shrink-0 rounded-full bg-muted" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="h-3 w-1/3 rounded bg-muted/70" />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <div className="h-4 w-10 rounded bg-muted" />
          <div className="h-3 w-14 rounded bg-muted/70" />
        </div>
        <div className="h-2.5 w-full rounded-full bg-muted" />
        <div className="h-3 w-28 rounded bg-muted/60" />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 gap-0.5">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-2.5 w-[7px] shrink-0 rounded-[2px] bg-muted',
                // Thin out the strip toward its trailing edge so the block does
                // not read as 30 identical bars.
                i % 3 === 0 ? 'opacity-60' : ''
              )}
            />
          ))}
        </div>
        <div className="h-3 w-16 shrink-0 rounded bg-muted/70" />
      </div>
    </div>
  );
}

export default GoalCardSkeleton;