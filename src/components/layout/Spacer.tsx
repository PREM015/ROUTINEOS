"use client";
/**
 * Spacer — an empty, flexible spacer element.
 *
 * Renders `flex-1` on a `<div>` so it pushes siblings apart in a flex row/column.
 * Hidden from assistive technology since it has no semantic content.
 */

import React from 'react';
import { cn } from '@/lib/utils';

export type SpacerProps = React.HTMLAttributes<HTMLDivElement>;

export function Spacer({ className, ...props }: SpacerProps) {
  return <div aria-hidden="true" className={cn('flex-1', className)} {...props} />;
}

export default Spacer;