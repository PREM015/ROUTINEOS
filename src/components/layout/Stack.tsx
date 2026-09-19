"use client";
/**
 * Stack — vertical flex layout with a configurable gap.
 *
 * Arranges children top-to-bottom with even spacing. `gap` accepts a Tailwind
 * spacing-scale number (default 4 = 1rem) or any CSS length string.
 *
 * Props:
 * - gap: spacing between children (number = rem/4, or CSS length)
 * - align: cross-axis alignment
 * - justify: main-axis distribution
 * - grow: render with flex-1 so the stack stretches to fill its parent
 */

import React from 'react';
import { cn } from '@/lib/utils';

export type StackAlign = 'stretch' | 'start' | 'center' | 'end';
export type StackJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  gap?: number | string;
  align?: StackAlign;
  justify?: StackJustify;
  grow?: boolean;
}

const ALIGN_MAP: Record<StackAlign, string> = {
  stretch: 'stretch',
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
};

const JUSTIFY_MAP: Record<StackJustify, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
};

function resolveGap(gap: number | string): string {
  return typeof gap === 'number' ? `${gap * 0.25}rem` : gap;
}

export function Stack({
  gap = 4,
  align = 'stretch',
  justify = 'start',
  grow = false,
  className,
  style,
  children,
  ...props
}: StackProps) {
  return (
    <div
      className={cn('flex flex-col', grow && 'flex-1', className)}
      style={{
        gap: resolveGap(gap),
        alignItems: ALIGN_MAP[align],
        justifyContent: JUSTIFY_MAP[justify],
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export default Stack;