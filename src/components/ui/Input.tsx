"use client";
import React, { useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  /**
   * Rendered inside the field at the trailing edge, e.g. a show/hide password
   * toggle. Kept out of the leading `icon` slot because that one is
   * `pointer-events-none` for decorative glyphs and cannot host a control.
   */
  trailing?: React.ReactNode;
}

/**
 * Text input with an optional label, leading icon, trailing control, and
 * error/helper text.
 *
 * The previous version rendered `<label>` with **no `htmlFor`** and gave the
 * input **no `id`**, so the two were never programmatically associated:
 * clicking the label did not focus the field, and assistive technology had no
 * reliable name for the control. It also never set `aria-invalid` or
 * `aria-describedby`, so a validation message rendered as plain text below the
 * field was not announced as being associated with it.
 *
 * Both are fixed here by generating an id with `useId` when the caller does not
 * supply one. The API is unchanged otherwise, so existing call sites — the
 * whole `(auth)` group plus many dashboard forms import this through the
 * `@/components/ui` barrel — keep working and simply get the fix for free.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className = '', label, error, helperText, icon, trailing, id, ...props },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const messageId = `${inputId}-message`;

    // Only point aria-describedby at something that actually exists, otherwise
    // screen readers announce a dangling reference.
    const describedBy =
      [error || helperText ? messageId : null, props['aria-describedby']]
        .filter(Boolean)
        .join(' ') || undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground"
            >
              {icon}
            </div>
          )}
          <input
            id={inputId}
            aria-invalid={error ? true : undefined}
            className={`block w-full rounded-lg border border-border bg-card shadow-sm transition-[border-color,box-shadow] duration-200 ease-out-expo placeholder:text-muted-foreground/60 focus:placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/25 focus:ring-offset-0 sm:text-sm px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60 ${
              icon ? 'pl-10' : ''
            } ${trailing ? 'pr-10' : ''} ${
              error
                ? 'border-destructive focus:border-destructive focus:ring-destructive/25'
                : ''
            } ${className}`}
            ref={ref}
            {...props}
            aria-describedby={describedBy}
          />
          {trailing && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">
              {trailing}
            </div>
          )}
        </div>
        {error ? (
          <p id={messageId} className="mt-1.5 text-sm text-destructive">
            {error}
          </p>
        ) : helperText ? (
          <p id={messageId} className="mt-1.5 text-sm text-muted-foreground">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = 'Input';
