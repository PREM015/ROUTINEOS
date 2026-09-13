export default function HabitsLoading() {
  return (
    <div className="space-y-3 p-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-14 w-full animate-pulse rounded-lg bg-neutral-800/60"
        />
      ))}
    </div>
  );
}
