export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-24 w-full animate-pulse rounded-2xl bg-neutral-800/60" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-neutral-800/60" />
        ))}
      </div>
      <div className="h-48 w-full animate-pulse rounded-2xl bg-neutral-800/60" />
    </div>
  );
}
