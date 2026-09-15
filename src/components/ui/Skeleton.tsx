import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const skeletonVariants = cva("animate-pulse rounded-md bg-gray-200");

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof skeletonVariants> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return <div className={skeletonVariants({ className })} {...props} />;
}
