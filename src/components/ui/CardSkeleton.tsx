import { Skeleton } from './Skeleton';

export interface CardSkeletonProps {
  lines?: number;
  shine?: boolean;
}

export function CardSkeleton({ lines = 3, shine = false }: CardSkeletonProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <Skeleton shine={shine} className="h-5 w-2/3" />
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${85 - i * 15}%` }} />
        ))}
      </div>
    </div>
  );
}