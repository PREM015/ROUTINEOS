/**
 * Route-level fallback for the RSC/bundle phase of `/recap`.
 *
 * This is a *second* skeleton, not the only one: the page is a Client Component
 * that fetches its own data, so once the bundle resolves this is replaced by
 * `RecapSkeleton` inside the page. They used to have two unrelated shapes
 * (2-column tiles plus a bar here, 4-column tiles plus a `h-72` there) against a
 * thirteen-card layout, so the page visibly rearranged itself while loading.
 *
 * It now mirrors that layout — the page's `container` wrapper and the same
 * tile / hero / 3-column card sequence — so the handoff between the two phases
 * is not a jump. `animate-pulse` is dropped under reduced motion.
 */
export default function RecapLoading() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-7 w-32 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          <div className="h-4 w-72 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
      </div>

      <div aria-hidden="true" className="animate-pulse space-y-6 motion-reduce:animate-none">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-muted" />
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-56 rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}