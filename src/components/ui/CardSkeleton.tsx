import React from 'react';
import { Skeleton } from './Skeleton';

export function CardSkeleton() {
  return (
    <div className="p-4 border rounded-xl space-y-3">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}
