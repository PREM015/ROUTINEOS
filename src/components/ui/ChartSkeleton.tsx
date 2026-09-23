import { Skeleton } from './Skeleton';

export interface ChartSkeletonProps {
  bars?: number;
  height?: number;
  shine?: boolean;
}

export function ChartSkeleton({ bars = 7, height = 256, shine = false }: ChartSkeletonProps) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-4 flex flex-col gap-4"
      style={{ height }}
    >
      <Skeleton shine={shine} className="h-5 w-1/3" />
      <div className="flex flex-1 items-end gap-2">
        {Array.from({ length: bars }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t-md"
            style={{ height: `${((i * 53) % 60) + 25}%` }}
          />
        ))}
      </div>
    </div>
  );
}