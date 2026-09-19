"use client";
/**
 * FormSection — visually grouped heading + description + content block.
 *
 * Wraps related form controls in a bordered card for scannable multi-part forms.
 * Optional `action` renders a trailing element in the header row.
 *
 * Props:
 * - heading: section title (optional)
 * - description: supporting text under the title (optional)
 * - action: right-aligned header element (e.g. a "reset" button)
 * - children: the form controls
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface FormSectionProps {
  heading?: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function FormSection({ heading, description, action, children, className }: FormSectionProps) {
  return (
    <section className={cn('space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5', className)}>
      {(heading !== undefined || action !== undefined) && (
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            {heading !== undefined && (
              <h3 className="text-base font-semibold text-white">{heading}</h3>
            )}
            {description !== undefined && <p className="text-sm text-zinc-400">{description}</p>}
          </div>
          {action !== undefined && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default FormSection;