import React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds a soft shimmer sweep across the block instead of the pulse. */
  shine?: boolean;
}

export function Skeleton({ className, shine = false, ...props }: SkeletonProps) {
  if (shine) {
    return (
      <div className={cn('relative overflow-hidden rounded-md bg-muted', className)} {...props}>
        <div
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent animate-shimmer"
          aria-hidden="true"
        />
      </div>
    );
  }
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}