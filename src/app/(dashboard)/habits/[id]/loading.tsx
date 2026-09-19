export default function HabitDetailLoading() {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto animate-pulse">
      {/* Back button skeleton */}
      <div className="h-5 w-20 rounded bg-zinc-800/60" />

      {/* Title + badges */}
      <div className="space-y-3">
        <div className="h-8 w-64 rounded-xl bg-zinc-800/60" />
        <div className="h-4 w-80 rounded bg-zinc-800/40" />
        <div className="flex gap-2">
          <div className="h-5 w-28 rounded-full bg-zinc-800/50" />
          <div className="h-5 w-16 rounded-full bg-zinc-800/50" />
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-9 w-28 rounded-xl bg-zinc-800/60" />
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-zinc-800/60" />
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-zinc-800 pb-0">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-6 w-16 rounded bg-zinc-800/60" />
        ))}
      </div>

      {/* Content */}
      <div className="h-40 w-full rounded-2xl bg-zinc-800/60" />
    </div>
  );
}
