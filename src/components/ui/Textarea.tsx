"use client";
import React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  /** Supplementary text rendered under the control. */
  helperText?: string;
}

/**
 * Textarea — a labelled native `<textarea>`.
 *
 * The label is wired to the control via a generated `id` so clicking it focuses
 * the field and screen readers announce the association. An explicit `id` prop
 * still wins when one is supplied.
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', label, error, helperText, id, ...props }, ref) => {
    const reactId = React.useId();
    const textareaId = id ?? `textarea-${reactId}`;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="mb-1.5 block text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          aria-invalid={error ? true : undefined}
          aria-describedby={helperText || error ? `${textareaId}-help` : undefined}
          className={`block w-full rounded-lg border border-border bg-card shadow-sm transition-[border-color,box-shadow] duration-200 ease-out-expo placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/25 sm:text-sm px-3 py-2 text-foreground disabled:opacity-60 disabled:cursor-not-allowed ${error ? 'border-destructive focus:border-destructive focus:ring-destructive/25' : ''} ${className}`}
          ref={ref}
          {...props}
        />
        {(helperText || error) && (
          <p
            id={`${textareaId}-help`}
            className={`mt-1.5 text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {error ?? helperText}
          </p>
        )}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
