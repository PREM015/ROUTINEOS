"use client";

/**
 * Tooltip — Radix UI tooltip wrapper. Requires exactly one focusable child
 * (use `asChild` semantics internally). `delay` maps to Radix's
 * `delayDuration` in milliseconds.
 *
 * Usage:
 *   <Tooltip content="Delete forever" side="top">
 *     <button>✕</button>
 *   </Tooltip>
 */
import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Delay before the tooltip appears, in milliseconds. */
  delay?: number;
  /** Classes applied to the tooltip content bubble. */
  className?: string;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  delay = 200,
  className,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root delayDuration={delay}>
        <TooltipPrimitive.Trigger asChild>
          {React.isValidElement(children) ? (
            children
          ) : (
            <span tabIndex={0}>{children}</span>
          )}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className={cn(
              'z-50 max-w-xs rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-floating tooltip-in',
              className,
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-foreground" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export default Tooltip;