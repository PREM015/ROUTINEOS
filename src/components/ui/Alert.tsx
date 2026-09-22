"use client";

/**
 * Alert — contextual feedback banner with a severity variant, optional
 * title/description, custom icon and a dismiss button.
 *
 * Usage:
 *   <Alert variant="danger" title="Sync failed" description="Please retry." onDismiss={close} />
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, CircleCheck, CircleX, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const alertVariants = cva('relative w-full rounded-lg border p-4', {
  variants: {
    variant: {
      info: 'border-blue-200 bg-blue-50 text-blue-900',
      success: 'border-green-200 bg-green-50 text-green-900',
      warning: 'border-yellow-200 bg-yellow-50 text-yellow-900',
      danger: 'border-red-200 bg-red-50 text-red-900',
    },
  },
  defaultVariants: {
    variant: 'info',
  },
});

const variantIcons = {
  info: CircleAlert,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
} as const;

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof alertVariants> {
  /** Short headline shown above the description. */
  title?: React.ReactNode;
  /** Supporting text; falls back to `children` when omitted. */
  description?: React.ReactNode;
  /** Custom icon node; defaults to the icon matching `variant`. */
  icon?: React.ReactNode;
  /** When provided, renders a dismiss button that calls this handler. */
  onDismiss?: () => void;
}

export function Alert({
  className,
  variant,
  title,
  description,
  icon,
  onDismiss,
  children,
  ...props
}: AlertProps) {
  const DefaultIcon = variantIcons[variant ?? 'info'];
  return (
    <div role="alert" className={cn(alertVariants({ variant }), 'flex gap-3', className)} {...props}>
      <div className="mt-0.5 shrink-0">{icon ?? <DefaultIcon className="h-5 w-5" />}</div>
      <div className="flex-1">
        {title && <h5 className="mb-1 text-sm font-semibold leading-none">{title}</h5>}
        {(description || children) && (
          <div className="text-sm opacity-90">{description ?? children}</div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss alert"
          className="shrink-0 self-start rounded-md p-1 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}