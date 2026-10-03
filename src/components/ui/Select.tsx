"use client";
import React from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  /** Supplementary text rendered under the control. */
  helperText?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

/**
 * Select — a labelled native `<select>`.
 *
 * The label is wired to the control via a generated `id` so clicking it focuses
 * the select and screen readers announce the association. An explicit `id` prop
 * still wins when one is supplied.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', label, error, helperText, options, placeholder, id, ...props }, ref) => {
    const reactId = React.useId();
    const selectId = id ?? `select-${reactId}`;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-foreground mb-1.5">
            {label}
          </label>
        )}
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={helperText || error ? `${selectId}-help` : undefined}
          className={`block w-full rounded-lg border border-border bg-card shadow-sm transition-[border-color,box-shadow] duration-200 ease-out-expo focus:border-primary focus:ring-2 focus:ring-primary/25 sm:text-sm px-3 py-2 text-foreground disabled:opacity-60 disabled:cursor-not-allowed ${error ? 'border-destructive focus:border-destructive focus:ring-destructive/25' : ''} ${className}`}
          ref={ref}
          {...props}
        >
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {options.map(opt => <option key={opt.value} value={opt.value} className="bg-card">{opt.label}</option>)}
        </select>
        {(helperText || error) && (
          <p
            id={`${selectId}-help`}
            className={`mt-1.5 text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {error ?? helperText}
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';

/**
 * SelectValue — displays the currently selected value.
 * 
 * This is a separate component (following Radix UI pattern) that renders the
 * currently selected option's label. It reads the value from the parent
 * Select's context or can be controlled via the `value` prop.
 */
interface SelectValueProps {
  /** The select value to display */
  value?: string;
  /** Placeholder when no value is selected */
  placeholder?: string;
  /** The options to resolve labels from values */
  options: { value: string; label: string }[];
  className?: string;
}

export const SelectValue = React.forwardRef<HTMLSpanElement, SelectValueProps>(
  ({ value, placeholder, options, className, ...props }, ref) => {
    const option = options.find(opt => opt.value === value);
    const display = option?.label ?? placeholder ?? '';
    
    return (
      <span
        ref={ref}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground ${className}`}
        {...props}
      >
        {display}
      </span>
    );
  }
);
SelectValue.displayName = 'SelectValue';
