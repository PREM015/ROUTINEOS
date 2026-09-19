"use client";

/**
 * Dialog — centered modal built on Radix UI's Dialog primitive with a
 * title, optional description, close button and a footer action slot.
 *
 * Usage:
 *   <Dialog open={open} onOpenChange={setOpen} title="Delete item?" description="This cannot be undone."
 *     footer={<Button variant="danger">Delete</Button>}>
 *     <p>Body content…</p>
 *   </Dialog>
 */
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
} as const;

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Actions rendered right-aligned at the bottom of the dialog. */
  footer?: React.ReactNode;
  /** Optional element that opens the dialog (rendered as a Radix trigger). */
  trigger?: React.ReactNode;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  trigger,
  size = 'md',
  className,
}: DialogProps) {
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
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl outline-none',
            SIZE_CLASSES[size],
            className,
          )}
        >
          {title && (
            <div className="mb-4 flex items-center justify-between gap-4">
              <DialogPrimitive.Title className="text-lg font-semibold text-gray-900">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>
          )}
          {description && (
            <DialogPrimitive.Description className="mb-4 text-sm text-gray-500">
              {description}
            </DialogPrimitive.Description>
          )}
          <div className="text-sm text-gray-700">{children}</div>
          {footer && (
            <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}