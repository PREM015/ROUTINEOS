import { GoalCardSkeleton } from '@/components/goals/GoalCardSkeleton';

/**
 * Route-level skeleton for `/goals`.
 *
 * The page previously had none. While `AppContext` was in flight, `goals` was
 * `[]`, so the page rendered its own "No daily goals" empty state — a confident,
 * complete-looking answer to a question whose data had not arrived. A user
 * reloading on a slow connection was told they had no goals.
 *
 * This mirrors the card grid's real geometry so the layout does not jump when the
 * data lands. It is deliberately static: the page's own skeletons are what handle
 * the second phase (the 30-day log window, which resolves after the goal list),
 * and a route skeleton that animated would compete with the Pace Track's entrance
 * for the user's attention.
 */
export default function Loading() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <div className="h-8 w-32 rounded bg-muted" />
        <div className="mt-2 h-4 w-64 rounded bg-muted/70" />
      </div>

      <div
        className="mb-6 flex w-fit gap-1 rounded-xl border border-border bg-card p-1"
        aria-hidden="true"
      >
        {['Daily', 'Long-term', 'Completed'].map((label, index) => (
          <div
            key={label}
            className={
              index === 0
                ? 'rounded-lg bg-muted px-3 py-2 text-sm font-medium text-foreground'
                : 'rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground'
            }
          >
            {label}
          </div>
        ))}
      </div>

      <div aria-busy="true" aria-label="Loading goals">
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <GoalCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}