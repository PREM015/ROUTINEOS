import React from 'react';
import { Skeleton } from './Skeleton';

export function ChartSkeleton() {
  return (
    <div className="w-full h-64 border rounded-xl flex items-end p-4 space-x-2">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} className="flex-1" style={{ height: `${Math.random() * 60 + 20}%` }} />
      ))}
    </div>
  );
}
