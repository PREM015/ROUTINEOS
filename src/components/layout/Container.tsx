"use client";
/**
 * Container — responsive max-width wrapper with horizontal gutters.
 *
 * Centers its children and constrains content width. Choose a `size` to cap the
 * maximum width (default `lg`).
 *
 * Props:
 * - size: 'sm' | 'md' | 'lg' | 'xl' | 'full' (max-width bucket)
 * - className, children, and all standard div props
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const SIZE_CLASSES = {
  sm: 'max-w-xl',
  md: 'max-w-3xl',
  lg: 'max-w-5xl',
  xl: 'max-w-7xl',
  full: 'max-w-none',
} as const;

export function Container({ size = 'lg', className, ...props }: ContainerProps) {
  return (
    <div
      className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', SIZE_CLASSES[size], className)}
      {...props}
    />
  );
}

export default Container;