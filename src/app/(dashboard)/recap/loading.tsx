export default function RecapLoading() {
  return (
    <div className="space-y-4 p-6">
      <div className="h-16 w-full animate-pulse rounded-2xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
