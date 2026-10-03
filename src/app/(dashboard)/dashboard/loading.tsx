import { Skeleton } from '@/components/ui';

/**
 * Route-level loading skeleton for `/dashboard`.
 *
 * This must mirror the real layout exactly, in three respects:
 *
 *  1. **The container.** `relative mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8`,
 *     including the aurora-mesh and grain layers, so the page does not snap
 *     background in on resolve.
 *  2. **The breakpoints.** 1 / 2 / 6 columns for the main grid, 2 / 4 / 8 for the
 *     Feature Hub, 1 / 2 for the day-type + adherence pair, and 6 / 3 / 3 inside
 *     the Momentum hero.
 *  3. **The section count and order.** Header strip, context strip, quote,
 *     Feature Hub, the Momentum hero, then the two-column grid (heatmap, radar,
 *     day types, adherence, habit health | insight, recap, goals, quick actions),
 *     then the achievements strip.
 *
 * The previous version still mirrored the *deleted* layout - it had a Day Type
 * card, the Day Pulse + Right Now hero pair and a four-card metrics row, none of
 * which exist any more. A skeleton that describes a page other than the one that
 * loads is worse than no skeleton: the layout reshapes on resolve, which is
 * exactly the "pops in at a different size than its loaded state" failure the
 * spec rules out.
 *
 * Spec: "Every card renders its exact final shape immediately as a shimmer
 * skeleton — same size, same position."
 */
export default function DashboardLoading() {
  return (
    <div
      className="relative mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 fade-rise-in"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div
        className="gradient-mesh-animated pointer-events-none absolute inset-0 -z-10 opacity-60"
        aria-hidden="true"
      />
      <div className="noise-overlay pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />

      {/* Header strip: seven 7px dots plus the day-type pill. */}
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-32 rounded-full" />
        <Skeleton className="h-7 w-40 rounded-full" />
      </div>

      {/* Context strip: two single lines with a rule between. */}
      <div className="space-y-3 border-y border-border/60 py-3">
        <Skeleton className="h-3.5 w-72 max-w-full" />
        <Skeleton className="h-3.5 w-48 max-w-full" />
      </div>

      {/* Quote of the day: full width. */}
      <Skeleton className="h-20 w-full rounded-[20px]" />

      {/* Feature Hub: 2 / 4 / 8 columns. */}
      <div>
        <Skeleton className="mb-3 h-3 w-24" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>

      {/*
        Momentum hero. The 6 / 3 / 3 split is the loaded layout's, so the trend
        plot, the streak ring and the composition bars each occupy the width they
        will actually occupy.
      */}
      <div
        className="glass-panel relative overflow-hidden rounded-[20px]"
        aria-hidden="true"
      >
        <div className="grid gap-6 p-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Skeleton className="h-3 w-32" />
            <Skeleton shine className="mt-3 h-14 w-56" />
            <Skeleton className="mt-3 h-4 w-80 max-w-full" />
            <Skeleton className="mt-4 h-[132px] w-full" />
          </div>
          <div className="flex justify-center lg:col-span-3">
            <Skeleton className="h-[124px] w-[124px] rounded-full" />
          </div>
          <div className="space-y-3 lg:col-span-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      </div>

      {/* Main grid: 1 / 2 / 6 columns, left spans 4, right spans 2. */}
      <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-6 lg:gap-6">
        <div className="min-w-0 space-y-4 sm:space-y-5 lg:col-span-4 lg:space-y-6">
          {/*
            Heatmap: 26 columns x 7 rows, the year view's real shape, plus the
            view toggle and the stats line the loaded card carries.
          */}
          <div className="glass-panel glass-panel-lift rounded-[20px] p-6" aria-hidden="true">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-2 h-3 w-40" />
              </div>
              <Skeleton className="h-7 w-36 rounded-full" />
            </div>
            <Skeleton className="mt-4 h-3 w-52" />
            <div className="mt-4 flex gap-1 overflow-hidden">
              {Array.from({ length: 26 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <Skeleton key={j} className="h-3 w-3 rounded-sm" />
                  ))}
                </div>
              ))}
            </div>
            <Skeleton className="mt-4 h-3 w-32" />
          </div>

          {/* Life balance radar: a square plot, matching the loaded 200px. */}
          <div className="glass-panel rounded-[20px] p-5" aria-hidden="true">
            <Skeleton className="mb-4 h-4 w-28" />
            <div className="flex justify-center">
              <Skeleton className="h-[200px] w-[200px] rounded-full" />
            </div>
            <div className="mt-3 flex justify-center gap-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-7 w-12" />
              ))}
            </div>
          </div>

          {/* Day types | adherence: 1-up on mobile, 2-up from md. */}
          <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
            <div className="glass-panel rounded-[20px] p-5" aria-hidden="true">
              <Skeleton className="mb-4 h-4 w-28" />
              <div className="space-y-2.5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </div>
            <div className="glass-panel rounded-[20px] p-5" aria-hidden="true">
              <Skeleton className="mb-4 h-4 w-32" />
              <div className="flex h-24 items-end gap-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-full flex-1" />
                ))}
              </div>
            </div>
          </div>

          {/* Habit health: tab row plus a few list rows. */}
          <div className="glass-panel rounded-[20px] p-5" aria-hidden="true">
            <Skeleton className="mb-4 h-4 w-32" />
            <div className="mb-3 flex gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-6 w-16 rounded-full" />
              ))}
            </div>
            <div className="space-y-1.5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-11 w-full rounded-[14px]" />
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4 sm:space-y-5 lg:col-span-2 lg:space-y-6">
          {/* AI insight. */}
          <div className="glass-panel rounded-[20px] p-5" aria-hidden="true">
            <Skeleton className="mb-3 h-4 w-28" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-4/5" />
          </div>

          {/* Weekly recap. */}
          <div className="glass-panel rounded-[20px] p-5" aria-hidden="true">
            <Skeleton className="mb-3 h-4 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-3/4" />
          </div>

          {/* Goals velocity. */}
          <div className="glass-panel rounded-[20px] p-5" aria-hidden="true">
            <Skeleton className="mb-3 h-4 w-16" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-2 h-3 w-64 max-w-full" />
          </div>

          {/* Quick actions: the real 2x2. */}
          <div className="glass-panel rounded-[20px] p-5" aria-hidden="true">
            <Skeleton className="mb-3 h-4 w-24" />
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-[14px]" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Achievements strip: nine medallion slots, as loaded. */}
      <div className="glass-panel rounded-[20px] p-5" aria-hidden="true">
        <Skeleton className="mb-3 h-4 w-28" />
        <div className="flex gap-1 overflow-hidden">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-[5.5rem] w-[5.5rem] shrink-0 rounded-[14px]" />
          ))}
        </div>
      </div>
    </div>
  );
}
