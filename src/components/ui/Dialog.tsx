"use client";

/**
 * Dialog — centered modal built on Radix UI's Dialog primitive.
 * Supports both high-level props pattern and compound Radix subcomponents.
 */
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BODY_CLASS, FOOTER_CLASS, GRAIN_CLASS, HEADER_CLASS, OVERLAY_CLASS, PANEL_CLASS } from './modal-frame';

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
} as const;

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
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
  // If used as a container wrapper around subcomponents, render Radix Root directly
  if (!title && !footer && !description && !trigger && open === undefined) {
    return <DialogPrimitive.Root>{children}</DialogPrimitive.Root>;
  }

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
        <DialogPrimitive.Overlay className={OVERLAY_CLASS}>
          <div className={GRAIN_CLASS} aria-hidden="true" />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content className={cn(PANEL_CLASS, 'content-in', SIZE_CLASSES[size], className)}>
          {title && (
            <div className={HEADER_CLASS}>
              <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>
          )}
          {description && (
            <DialogPrimitive.Description className="mb-4 shrink-0 text-sm text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          )}
          <div className={cn(BODY_CLASS, 'text-sm text-foreground')}>{children}</div>
          {footer && <div className={FOOTER_CLASS}>{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogOverlay = DialogPrimitive.Overlay;

export function DialogContent({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={OVERLAY_CLASS}>
        <div className={GRAIN_CLASS} aria-hidden="true" />
      </DialogPrimitive.Overlay>
      <DialogPrimitive.Content className={cn(PANEL_CLASS, className)} {...props}>
        <div className={BODY_CLASS}>{children}</div>
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 text-center sm:text-left mb-4', className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-lg font-semibold text-foreground tracking-tight', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export default Dialog;