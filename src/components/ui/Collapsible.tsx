"use client";

/**
 * Collapsible — a show/hide region built on Radix UI's Collapsible
 * primitive. Can be controlled (`open`/`onOpenChange`) or uncontrolled
 * via `defaultOpen`.
 *
 * Usage:
 *   <Collapsible trigger={<Button variant="ghost">Details</Button>}>
 *     <p>Hidden until expanded.</p>
 *   </Collapsible>
 */
import * as React from 'react';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { cn } from '@/lib/utils';

export interface CollapsibleProps {
  /** Controlled open state. Omit to let the component manage it internally. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Initial state when uncontrolled. */
  defaultOpen?: boolean;
  /** Content rendered inside the header/trigger button. */
  trigger: React.ReactNode;
  /** Content revealed when the collapsible is open. */
  children: React.ReactNode;
  /** Classes applied to the accordion root. */
  className?: string;
  /** Classes applied to the content wrapper. */
  contentClassName?: string;
  /** Classes applied to the trigger button. */
  triggerClassName?: string;
}

export function Collapsible({
  open,
  onOpenChange,
  defaultOpen = false,
  trigger,
  children,
  className,
  contentClassName,
  triggerClassName,
}: CollapsibleProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? (open as boolean) : internalOpen;

  const handleOpenChange = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <CollapsiblePrimitive.Root
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn('w-full', className)}
    >
      <CollapsiblePrimitive.Trigger asChild className={cn('w-full text-left', triggerClassName)}>
        <button type="button" aria-expanded={isOpen}>
          {trigger}
        </button>
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Content
        className={cn('overflow-hidden data-[state=closed]:hidden', contentClassName)}
      >
        {children}
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  );
}