"use client";
/**
 * FormField — label + control + hint/error wrapper for form inputs.
 *
 * Associates the rendered `children` with a `<label>` via `name`/`htmlFor`, and
 * shows either an `error` or a `hint` line below the control. Purely
 * presentational — wire values/onChange via your input or the Form context.
 *
 * Props:
 * - name: field name used as the htmlFor/id (optional)
 * - label: label text (optional)
 * - hint: helper text shown when no error (optional)
 * - error: validation message shown instead of the hint (optional)
 * - required: render a red asterisk next to the label
 * - htmlFor: explicit label target (overrides `name`)
 * - children: the form control(s)
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  name?: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({
  name,
  label,
  hint,
  error,
  required = false,
  htmlFor,
  className,
  children,
}: FormFieldProps) {
  const forId = htmlFor ?? name;

  return (
    <div className={cn('space-y-1', className)}>
      {label !== undefined && (
        <label htmlFor={forId} className="block text-sm font-medium text-zinc-300">
          {label}
          {required && (
            <span className="ml-0.5 text-red-400" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

export default FormField;