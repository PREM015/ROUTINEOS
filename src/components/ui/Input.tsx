"use client";
import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, helperText, icon, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>}
        <div className="relative">
          {icon && <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">{icon}</div>}
          <input
            className={`block w-full rounded-lg border border-border bg-card shadow-sm transition-[border-color,box-shadow] duration-200 ease-out-expo placeholder:text-muted-foreground/60 focus:placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/25 focus:ring-offset-0 sm:text-sm px-3 py-2 disabled:opacity-60 disabled:cursor-not-allowed ${
              icon ? 'pl-10' : ''
            } ${error ? 'border-destructive focus:border-destructive focus:ring-destructive/25' : ''} ${className}`}
            ref={ref}
            {...props}
          />
        </div>
        {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
        {!error && helperText && <p className="mt-1.5 text-sm text-muted-foreground">{helperText}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';