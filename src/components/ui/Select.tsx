"use client";
import React from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', label, error, options, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>}
        <select
          className={`block w-full rounded-lg border border-border bg-card shadow-sm transition-[border-color,box-shadow] duration-200 ease-out-expo focus:border-primary focus:ring-2 focus:ring-primary/25 sm:text-sm px-3 py-2 text-foreground disabled:opacity-60 disabled:cursor-not-allowed ${error ? 'border-destructive focus:border-destructive focus:ring-destructive/25' : ''} ${className}`}
          ref={ref}
          {...props}
        >
          {options.map(opt => <option key={opt.value} value={opt.value} className="bg-card">{opt.label}</option>)}
        </select>
        {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';