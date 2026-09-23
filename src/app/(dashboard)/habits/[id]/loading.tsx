export default function HabitDetailLoading() {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto animate-pulse">
      {/* Back button skeleton */}
      <div className="h-5 w-20 rounded bg-muted" />

      {/* Title + badges */}
      <div className="space-y-3">
        <div className="h-8 w-64 rounded-xl bg-muted" />
        <div className="h-4 w-80 rounded bg-muted/50" />
        <div className="flex gap-2">
          <div className="h-5 w-28 rounded-full bg-muted/50" />
          <div className="h-5 w-16 rounded-full bg-muted/50" />
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-9 w-28 rounded-xl bg-muted" />
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-muted" />
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border pb-0">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-6 w-16 rounded bg-muted" />
        ))}
      </div>

      {/* Content */}
      <div className="h-40 w-full rounded-2xl bg-muted" />
    </div>
  );
}
