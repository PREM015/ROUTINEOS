"use client";

/**
 * Drawer — a slide-in panel anchored to the left, right or bottom edge,
 * built on Radix UI's Dialog primitive (modal overlay + focus trap).
 *
 * Usage:
 *   <Drawer open={open} onOpenChange={setOpen} side="right" title="Settings">
 *     <p>Drawer body…</p>
 *   </Drawer>
 */
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type DrawerSide = 'left' | 'right' | 'bottom';

const SIDE_CLASSES: Record<DrawerSide, string> = {
  left: 'left-0 top-0 h-full max-w-sm inset-y-0 drawer-in-left',
  right: 'right-0 top-0 h-full max-w-sm inset-y-0 drawer-in-right',
  bottom: 'bottom-0 left-0 w-full max-h-[85vh] rounded-t-xl drawer-in-bottom',
};

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: DrawerSide;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Optional element that opens the drawer (rendered as a Radix trigger). */
  trigger?: React.ReactNode;
  className?: string;
}

export function Drawer({
  open,
  onOpenChange,
  side = 'right',
  title,
  description,
  children,
  trigger,
  className,
}: DrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger && (
        <DialogPrimitive.Trigger asChild>
          {React.isValidElement(trigger) ? (
            trigger
          ) : (
            <button type="button" className="text-sm">
              {trigger}
            </button>
          )}
        </DialogPrimitive.Trigger>
      )}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm overlay-in" />
        <DialogPrimitive.Content
          className={cn(
            'fixed z-50 flex flex-col border-border bg-card text-foreground shadow-modal outline-none',
            SIDE_CLASSES[side],
            className,
          )}
        >
          {(title || description) && (
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div>
                {title && (
                  <DialogPrimitive.Title className="text-base font-semibold text-foreground">
                    {title}
                  </DialogPrimitive.Title>
                )}
                {description && (
                  <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              <DialogPrimitive.Close className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-5 text-sm text-muted-foreground">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}