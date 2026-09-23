import { CardSkeleton, ChartSkeleton, Skeleton } from '@/components/ui';

export default function DashboardLoading() {
  return (
    <div className="space-y-8 fade-rise-in" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-3">
        <Skeleton shine className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-24 rounded-xl" />
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} lines={3} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <ChartSkeleton bars={8} />
          <ChartSkeleton bars={12} height={180} />
        </div>
        <ChartSkeleton bars={4} height={180} />
      </div>
    </div>
  );
}