"use client";
/**
 * Grid — CSS grid layout with a configurable column count and gap.
 *
 * Renders children as equal-width tracks (minmax(0, 1fr)). `gap` accepts a
 * Tailwind spacing-scale number (default 4 = 1rem) or any CSS length string.
 *
 * Props:
 * - cols: number of columns (default 1)
 * - gap: gap between tracks (number = rem/4, or CSS length)
 * - align: cross-axis alignment of items
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  cols?: number;
  gap?: number | string;
  align?: React.CSSProperties['alignItems'];
}

function resolveGap(gap: number | string): string {
  return typeof gap === 'number' ? `${gap * 0.25}rem` : gap;
}

export function Grid({
  cols = 1,
  gap = 4,
  align,
  className,
  style,
  children,
  ...props
}: GridProps) {
  return (
    <div
      className={cn('grid', className)}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: resolveGap(gap),
        alignItems: align,
        minWidth: 0,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export default Grid;